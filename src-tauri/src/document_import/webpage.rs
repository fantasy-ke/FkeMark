use super::{network, webpage_url, WebpageSnapshot, MAX_WEBPAGE_BYTES};
use serde::Deserialize;
use std::{cell::RefCell, collections::HashMap, sync::Mutex, time::Duration};
use tauri::{Manager, WebviewWindow, Window, WindowBuilder, WindowEvent};
use tokio::sync::oneshot;
use wry::{NewWindowResponse, WebView, WebViewBuilder};

thread_local! {
    // 原生 WebView 只能在 GUI 线程创建、访问和销毁。
    static BROWSERS: RefCell<HashMap<String, WebView>> = RefCell::new(HashMap::new());
}

const PREFIX: &str = "webpage-import-";
const OPEN_FAILED: &str = "webpage_open_failed";
const CLOSED: &str = "webpage_closed";
const NOT_READY: &str = "webpage_not_ready";

fn allowed_navigation(value: &str) -> bool {
    network::validate_url(value).is_ok_and(|url| url.scheme() == "https")
}

fn create_browser(
    owner: &WebviewWindow,
    label: &str,
    url: &str,
    title: &str,
) -> Result<(), &'static str> {
    // 只创建原生窗口；不把 Tauri 的 IPC 和本地资源协议注册到第三方网页。
    let window = WindowBuilder::new(owner.app_handle(), label)
        .title(title)
        .inner_size(600., 420.)
        .min_inner_size(480., 320.)
        .position(0., 0.)
        .visible(false)
        .build()
        .map_err(|_| OPEN_FAILED)?;
    if let Ok(Some(monitor)) = owner.current_monitor() {
        let _ = window.set_position(monitor.work_area().position);
    }
    let destination = window.clone();
    let title = title.to_owned();
    let builder = WebViewBuilder::new()
        .with_url(url)
        .with_incognito(true)
        .with_devtools(false)
        .with_navigation_handler(|url| allowed_navigation(&url))
        .with_new_window_req_handler(|_, _| NewWindowResponse::Deny)
        .with_download_started_handler(|_, _| false)
        .with_on_page_load_handler(move |_, url| {
            if let Ok(url) = webpage_url(&url) {
                let _ = destination
                    .set_title(&format!("{title} — {}", url.host_str().unwrap_or_default()));
            }
        });
    let result = build_webview(builder, &window).and_then(|browser| {
        BROWSERS.with_borrow_mut(|browsers| browsers.insert(label.to_owned(), browser));
        window
            .show()
            .and_then(|_| window.set_focus())
            .map_err(|_| OPEN_FAILED)?;
        Ok(())
    });
    if result.is_err() {
        let _ = window.destroy();
    }
    result
}

fn build_webview(builder: WebViewBuilder<'_>, window: &Window) -> Result<WebView, &'static str> {
    #[cfg(target_os = "linux")]
    let result = {
        use wry::WebViewBuilderExtUnix;
        builder.build_gtk(&window.default_vbox().map_err(|_| OPEN_FAILED)?)
    };
    #[cfg(not(target_os = "linux"))]
    let result = builder.build(window);
    result.map_err(|_| OPEN_FAILED)
}

pub(crate) fn on_window_event(window: &Window, event: &WindowEvent) {
    if !matches!(event, WindowEvent::Destroyed) {
        return;
    }
    if window.label().starts_with(PREFIX) {
        BROWSERS.with_borrow_mut(|browsers| browsers.remove(window.label()));
    } else if let Some(browser) = window.get_window(&format!("{PREFIX}{}", window.label())) {
        let _ = browser.destroy();
    }
}

#[tauri::command]
pub async fn open_webpage_import(
    window: WebviewWindow,
    url: String,
    title: String,
) -> Result<(), String> {
    webpage_url(&url)?;
    let label = format!("{PREFIX}{}", window.label());
    let (tx, rx) = oneshot::channel();
    window
        .clone()
        .run_on_main_thread(move || {
            let result = if let Some(browser) = window.get_window(&label) {
                browser
                    .show()
                    .and_then(|_| browser.set_focus())
                    .map_err(|_| OPEN_FAILED)
            } else {
                create_browser(&window, &label, url.trim(), &title)
            };
            let _ = tx.send(result.map_err(str::to_owned));
        })
        .map_err(|_| OPEN_FAILED.to_string())?;
    rx.await.map_err(|_| OPEN_FAILED.to_string())?
}

#[derive(Deserialize)]
#[serde(untagged)]
enum CaptureResult {
    Snapshot { html: String },
    Error { error: String },
}

fn read_capture(url: tauri::Url, payload: String) -> Result<WebpageSnapshot, String> {
    if payload.len() > MAX_WEBPAGE_BYTES * 6 + 64 {
        return Err("input_too_large".into());
    }
    match serde_json::from_str(&payload).map_err(|_| NOT_READY.to_string())? {
        CaptureResult::Snapshot { html } if html.len() <= MAX_WEBPAGE_BYTES => {
            Ok(WebpageSnapshot {
                url: url.into(),
                html,
            })
        }
        CaptureResult::Snapshot { .. } => Err("input_too_large".into()),
        CaptureResult::Error { error } => match error.as_str() {
            "webpage_sign_in" | "empty_result" | "input_too_large" => Err(error),
            _ => Err(NOT_READY.into()),
        },
    }
}

#[tauri::command]
pub async fn capture_webpage_import(window: WebviewWindow) -> Result<WebpageSnapshot, String> {
    let label = format!("{PREFIX}{}", window.label());
    let (tx, rx) = oneshot::channel();
    window
        .run_on_main_thread(move || {
            let sender = std::sync::Arc::new(Mutex::new(Some(tx)));
            let result = BROWSERS.with_borrow(|browsers| {
                let browser = browsers.get(&label).ok_or(CLOSED)?;
                let url =
                    webpage_url(&browser.url().map_err(|_| NOT_READY)?).map_err(|_| NOT_READY)?;
                let sender = sender.clone();
                browser
                    .evaluate_script_with_callback(
                        include_str!("capture_page.js"),
                        move |payload| {
                            if let Some(tx) = sender.lock().unwrap().take() {
                                let _ = tx.send(read_capture(url.clone(), payload));
                            }
                        },
                    )
                    .map_err(|_| NOT_READY)
            });
            if let Err(error) = result {
                if let Some(tx) = sender.lock().unwrap().take() {
                    let _ = tx.send(Err(error.into()));
                }
            }
        })
        .map_err(|_| CLOSED.to_string())?;
    tokio::time::timeout(Duration::from_secs(8), rx)
        .await
        .map_err(|_| NOT_READY.to_string())?
        .map_err(|_| NOT_READY.to_string())?
}

#[tauri::command]
pub fn close_webpage_import(window: WebviewWindow) -> Result<(), String> {
    if let Some(browser) = window.get_window(&format!("{PREFIX}{}", window.label())) {
        browser.destroy().map_err(|_| CLOSED.to_string())?;
    }
    Ok(())
}
