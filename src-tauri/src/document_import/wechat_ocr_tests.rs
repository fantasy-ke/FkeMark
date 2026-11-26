use super::*;

#[tokio::test]
async fn 无扩展名网址仅在图片类型和签名一致时交给微信识别() {
    let directory = tempfile::tempdir().unwrap();
    let source = directory.path().join("input");
    let mut request = ConversionRequest {
        protocol_version: crate::document_import::PROTOCOL_VERSION,
        path: source.to_string_lossy().into_owned(),
        extension: String::new(),
        url: None,
        content_type: Some("image/png; charset=binary".into()),
        filename: "document".into(),
    };
    fs::write(&source, b"%PDF-1.7\n1 0 obj").unwrap();
    assert_eq!(image_format(&request).await, None);
    image::RgbImage::new(1, 1)
        .save_with_format(&source, ImageFormat::Png)
        .unwrap();
    assert_eq!(image_format(&request).await, Some(ImageFormat::Png));
    request.extension = ".pdf".into();
    assert_eq!(image_format(&request).await, None);
}

#[test]
fn 运行时完整但桥接程序损坏时无需重新下载() {
    let directory = tempfile::tempdir().unwrap();
    assert!(!complete(directory.path()));
    for path in required_files() {
        let path = directory.path().join(path);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, [1]).unwrap();
    }
    assert!(complete(directory.path()));
    let bridge = directory.path().join(BRIDGE_NAME);
    fs::write(&bridge, b"truncated").unwrap();
    assert!(complete(directory.path()));
    refresh_bridge(directory.path()).unwrap();
    assert_eq!(fs::read(bridge).unwrap(), BRIDGE);
    fs::remove_file(directory.path().join("wco_data/WeChatOCR.exe")).unwrap();
    assert!(!complete(directory.path()));
}

#[test]
fn 识别输入校验尺寸并将透明像素铺白() {
    let directory = tempfile::tempdir().unwrap();
    let source = directory.path().join("input.png");
    let normalized = directory.path().join("ocr.png");
    let image = image::RgbaImage::from_pixel(8193, 1, image::Rgba([20, 40, 80, 0]));
    image.save(&source).unwrap();
    assert_eq!(
        normalize(&source, &normalized, ImageFormat::Png),
        Err("input_too_large")
    );
    image::RgbaImage::from_pixel(1, 1, image::Rgba([20, 40, 80, 0]))
        .save(&source)
        .unwrap();
    assert_eq!(
        normalize(&source, &normalized, ImageFormat::WebP),
        Err("conversion_failed")
    );
    normalize(&source, &normalized, ImageFormat::Png).unwrap();
    assert_eq!(
        image::open(normalized)
            .unwrap()
            .into_rgba8()
            .get_pixel(0, 0)
            .0,
        [255, 255, 255, 255]
    );
}

#[tokio::test]
#[ignore = "需要访问 NuGet 并运行原生微信 OCR"]
async fn 从真实上游安装并识别中文图片() {
    let directory = tempfile::tempdir().unwrap();
    let destination = directory.path().join("ocr");
    let source =
        std::env::var_os("FKEMARK_WECHAT_OCR_TEST_IMAGE").expect("指定包含「中文」的 PNG 测试图");
    fs::create_dir(&destination).unwrap();
    fs::write(destination.join("incomplete"), []).unwrap();
    install_to(&destination).await.unwrap();
    assert!(complete(&destination));
    let input = directory.path().join("input");
    fs::copy(source, &input).unwrap();
    let result = run(
        &destination,
        &ConversionRequest {
            protocol_version: crate::document_import::PROTOCOL_VERSION,
            path: input.to_string_lossy().into_owned(),
            extension: ".png".into(),
            url: None,
            content_type: None,
            filename: "中文图片.png".into(),
        },
        ImageFormat::Png,
    )
    .await
    .unwrap();
    assert!(result.markdown.contains("中文"), "{}", result.markdown);
    assert_eq!(result.file_name, "中文图片.png");
}
