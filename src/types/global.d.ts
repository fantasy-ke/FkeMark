// Tauri 全局类型定义
interface Window {
  __TAURI__?: any;
  __TAURI_IPC__?: Function;
  __TAURI_INTERNALS__?: any;
}

// Vite 构建时注入的全局变量（全局声明，无需 import）
declare const __APP_VERSION__: string
declare const __UPDATE_CHANNEL__: string
