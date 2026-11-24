use std::io::{Read, Write};
use std::time::Duration;

fn main() {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).unwrap();
    if input.contains("timeout") {
        // 超时夹具保持进程和管道打开，由调用方负责终止。
        std::thread::sleep(Duration::from_secs(60));
        return;
    }
    if input.contains("stderr_limit") {
        std::io::stderr()
            .write_all(&vec![b'x'; 128 * 1024])
            .unwrap();
    }
    if input.contains("stdout_limit") {
        let buffer = [b'x'; 8192];
        for _ in 0..5000 {
            if std::io::stdout().write_all(&buffer).is_err() {
                return;
            }
        }
    }
    if input.contains("noisy") {
        println!("非协议输出");
    }
    if input.contains("failure") {
        println!(r#"{{"protocolVersion":1,"error":"conversion_failed"}}"#);
        std::process::exit(1);
    }
    println!(r##"{{"protocolVersion":1,"markdown":"# fixture","title":null}}"##);
}
