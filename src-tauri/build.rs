fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() == Ok("x86_64")
    {
        build_wechat_ocr_bridge();
    }
    tauri_build::build()
}

fn build_wechat_ocr_bridge() {
    use std::{env, path::PathBuf, process::Command};

    let source = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap())
        .join("src")
        .join("document_import")
        .join("wechat_ocr_bridge.cs");
    println!("cargo:rerun-if-changed={}", source.display());
    let framework = PathBuf::from(env::var_os("SystemRoot").expect("缺少 Windows 系统目录"))
        .join("Microsoft.NET/Framework64/v4.0.30319");
    let output = PathBuf::from(env::var_os("OUT_DIR").unwrap()).join("wechat-ocr-bridge.exe");
    let mut output_arg = std::ffi::OsString::from("/out:");
    output_arg.push(output);
    let compilation = Command::new(framework.join("csc.exe"))
        .args([
            "/nologo",
            "/target:exe",
            "/platform:x64",
            "/optimize+",
            "/codepage:65001",
            "/reference:System.Web.Extensions.dll",
            "/reference:System.IO.Compression.dll",
            "/reference:System.IO.Compression.FileSystem.dll",
        ])
        .arg(output_arg)
        .arg(source)
        .output()
        .expect("无法运行 Windows .NET Framework 的 C# 编译器");
    assert!(
        compilation.status.success(),
        "微信 OCR 桥接程序编译失败：{}{}",
        String::from_utf8_lossy(&compilation.stdout),
        String::from_utf8_lossy(&compilation.stderr)
    );
}
