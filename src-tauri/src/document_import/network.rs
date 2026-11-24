use super::{supported_extension, MAX_INPUT_BYTES};
use futures_util::StreamExt;
use reqwest::{Client, Response, Url};
use std::net::{IpAddr, SocketAddr};
use std::path::Path;
use std::time::Duration;
use tokio::io::AsyncWriteExt;

pub(super) struct DownloadedInput {
    pub extension: String,
    pub url: String,
    pub content_type: Option<String>,
    pub filename: String,
}

pub(super) fn public_address(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(address) => {
            let [a, b, c, _] = address.octets();
            !(a == 0
                || a == 10
                || a == 127
                || a >= 224
                || (a == 100 && (64..=127).contains(&b))
                || (a == 169 && b == 254)
                || (a == 172 && (16..=31).contains(&b))
                || (a == 192
                    && (b == 168 || (b == 0 && (c == 0 || c == 2)) || (b == 88 && c == 99)))
                || (a == 198 && ((b == 18 || b == 19) || (b == 51 && c == 100)))
                || (a == 203 && b == 0 && c == 113))
        }
        IpAddr::V6(address) => {
            // 仅接受原生全球单播，拒绝映射、转换和文档保留地址。
            let parts = address.segments();
            parts[0] & 0xe000 == 0x2000
                && !(parts[0] == 0x2001 && (parts[1] < 0x0200 || parts[1] == 0x0db8))
                && parts[0] != 0x2002
                && !(parts[0] == 0x3fff && parts[1] < 0x1000)
        }
    }
}

pub(super) fn validate_url(value: &str) -> Result<Url, String> {
    if value.trim().is_empty() || value.len() > 8192 || value.chars().any(char::is_control) {
        return Err("invalid_url".into());
    }
    let mut url = Url::parse(value.trim()).map_err(|_| "invalid_url".to_string())?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.host_str().is_none()
    {
        return Err("invalid_url".into());
    }
    let host = url.host_str().unwrap_or_default();
    if host.eq_ignore_ascii_case("localhost") || host.to_ascii_lowercase().ends_with(".localhost") {
        return Err("invalid_url".into());
    }
    if let Ok(address) = host.trim_matches(['[', ']']).parse::<IpAddr>() {
        if !public_address(address) {
            return Err("invalid_url".into());
        }
    }
    url.set_fragment(None);
    Ok(url)
}

async fn pinned_client(url: &Url) -> Result<Client, String> {
    let host = url.host_str().ok_or("invalid_url")?;
    let port = url.port_or_known_default().ok_or("invalid_url")?;
    let addresses: Vec<SocketAddr> =
        if let Ok(address) = host.trim_matches(['[', ']']).parse::<IpAddr>() {
            vec![SocketAddr::new(address, port)]
        } else {
            tokio::net::lookup_host((host, port))
                .await
                .map_err(|_| "network_failed".to_string())?
                .collect()
        };
    if addresses.is_empty()
        || addresses
            .iter()
            .any(|address| !public_address(address.ip()))
    {
        return Err("invalid_url".into());
    }
    // 每一跳独立客户端，并绑定已验证的 DNS 结果，保留原域名的 TLS 验证。
    Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .no_gzip()
        .no_brotli()
        .no_deflate()
        .no_zstd()
        .resolve_to_addrs(host, &addresses)
        .build()
        .map_err(|_| "network_failed".into())
}

async fn save_response(response: Response, path: &Path) -> Result<Option<String>, String> {
    if !response.status().is_success() {
        return Err("network_failed".into());
    }
    if response
        .headers()
        .get(reqwest::header::CONTENT_ENCODING)
        .is_some_and(|encoding| {
            encoding
                .to_str()
                .map_or(true, |value| !value.eq_ignore_ascii_case("identity"))
        })
    {
        return Err("network_failed".into());
    }
    if response
        .content_length()
        .is_some_and(|size| size > MAX_INPUT_BYTES)
    {
        return Err("input_too_large".into());
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let mut output = tokio::fs::File::create(path)
        .await
        .map_err(|_| "file_read_failed".to_string())?;
    let mut stream = response.bytes_stream();
    let mut total = 0u64;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| "network_failed".to_string())?;
        total += chunk.len() as u64;
        if total > MAX_INPUT_BYTES {
            return Err("input_too_large".into());
        }
        output
            .write_all(&chunk)
            .await
            .map_err(|_| "file_read_failed".to_string())?;
    }
    output
        .flush()
        .await
        .map_err(|_| "file_read_failed".to_string())?;
    Ok(content_type)
}

pub(super) async fn download(value: &str, path: &Path) -> Result<DownloadedInput, String> {
    let mut url = validate_url(value)?;
    for redirect_count in 0..=5 {
        let response = pinned_client(&url)
            .await?
            .get(url.clone())
            .header(reqwest::header::ACCEPT_ENCODING, "identity")
            .header(reqwest::header::USER_AGENT, "DocumentConverter/1.0")
            .send()
            .await
            .map_err(|error| {
                if error.is_timeout() {
                    "timeout".to_string()
                } else {
                    "network_failed".to_string()
                }
            })?;
        if matches!(response.status().as_u16(), 301 | 302 | 303 | 307 | 308) {
            if redirect_count == 5 {
                return Err("network_failed".into());
            }
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or("network_failed")?;
            let next = url.join(location).map_err(|_| "invalid_url".to_string())?;
            url = validate_url(next.as_str())?;
            continue;
        }
        let content_type = save_response(response, path).await?;
        let filename = url
            .path_segments()
            .and_then(|segments| segments.filter(|segment| !segment.is_empty()).next_back())
            .filter(|name| name.len() <= 240)
            .unwrap_or("document")
            .to_string();
        let extension = supported_extension(Path::new(&filename)).unwrap_or_default();
        return Ok(DownloadedInput {
            extension,
            url: url.into(),
            content_type,
            filename,
        });
    }
    Err("network_failed".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::AsyncReadExt;

    #[test]
    fn 拒绝不安全协议凭据和特殊地址() {
        for value in [
            "",
            "file:///test.pdf",
            "javascript:alert(1)",
            "https://user:pass@example.com",
            "http://localhost",
            "http://127.0.0.1",
            "http://2130706433",
            "http://10.0.0.1",
            "http://169.254.169.254",
            "http://[::1]",
            "http://[::ffff:127.0.0.1]",
            "https://example.com\n",
        ] {
            assert!(validate_url(value).is_err(), "{value}");
        }
        assert_eq!(
            validate_url("https://example.com/page#title")
                .unwrap()
                .as_str(),
            "https://example.com/page"
        );
    }

    #[test]
    fn 公网校验覆盖两类地址和保留网络() {
        for address in [
            "0.0.0.0",
            "100.64.0.1",
            "172.31.2.1",
            "192.168.1.1",
            "198.18.1.1",
            "224.0.0.1",
            "::",
            "fe80::1",
            "fc00::1",
            "2002:7f00:1::",
            "2001:db8::1",
            "::ffff:8.8.8.8",
        ] {
            assert!(!public_address(address.parse().unwrap()), "{address}");
        }
        for address in [
            "8.8.8.8",
            "1.1.1.1",
            "2606:4700:4700::1111",
            "2001:4860:4860::8888",
        ] {
            assert!(public_address(address.parse().unwrap()), "{address}");
        }
    }

    #[test]
    fn 重定向目标也需要安全校验() {
        let origin = validate_url("https://example.com/page").unwrap();
        assert!(validate_url(origin.join("http://127.0.0.1/private").unwrap().as_str()).is_err());
        assert!(validate_url(origin.join("//169.254.169.254/metadata").unwrap().as_str()).is_err());
        assert_eq!(
            validate_url(origin.join("/document.pdf").unwrap().as_str())
                .unwrap()
                .path(),
            "/document.pdf"
        );
    }

    #[tokio::test]
    async fn 错误状态压缩响应和超大声明不会进入转换器() {
        for (headers, expected) in [
            ("404 Not Found\r\nContent-Length: 0", "network_failed"),
            (
                "200 OK\r\nContent-Encoding: gzip\r\nContent-Length: 0",
                "network_failed",
            ),
            ("200 OK\r\nContent-Length: 52428801", "input_too_large"),
        ] {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let server = tokio::spawn(async move {
                let (mut socket, _) = listener.accept().await.unwrap();
                let mut buffer = [0; 2048];
                socket.read(&mut buffer).await.unwrap();
                socket
                    .write_all(
                        format!("HTTP/1.1 {headers}\r\nConnection: close\r\n\r\n").as_bytes(),
                    )
                    .await
                    .unwrap();
            });
            let response = Client::builder()
                .no_proxy()
                .no_gzip()
                .no_brotli()
                .no_deflate()
                .no_zstd()
                .build()
                .unwrap()
                .get(format!("http://{address}"))
                .send()
                .await
                .unwrap();
            let directory = tempfile::tempdir().unwrap();
            assert_eq!(
                save_response(response, &directory.path().join("input"))
                    .await
                    .unwrap_err(),
                expected
            );
            server.await.unwrap();
        }
    }

    #[tokio::test]
    async fn 流式响应保存不依赖公网() {
        // 只测试响应消费；生产下载仍需经过 URL、DNS 和地址校验。
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buffer = [0; 2048];
            socket.read(&mut buffer).await.unwrap();
            socket.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 5\r\nConnection: close\r\n\r\nhello").await.unwrap();
        });
        let response = Client::builder()
            .no_proxy()
            .build()
            .unwrap()
            .get(format!("http://{address}"))
            .send()
            .await
            .unwrap();
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("input");
        assert_eq!(
            save_response(response, &path).await.unwrap(),
            Some("text/html".into())
        );
        assert_eq!(tokio::fs::read(&path).await.unwrap(), b"hello");
        server.await.unwrap();
    }
}
