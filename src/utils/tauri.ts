/**
 * 检测是否在 Tauri 环境中运行
 * @returns 返回是否在 Tauri 环境中
 */
export function isTauri(): boolean {
  // Tauri v2: 检查 window.__TAURI_INTERNALS__ 或 window.__TAURI__
  // Tauri v1 兼容: 检查 window.__TAURI_IPC__
  return typeof window !== 'undefined' &&
    (window.__TAURI_INTERNALS__ !== undefined ||
     window.__TAURI__ !== undefined);
}

/**
 * 安全地调用 Tauri API，如果不在 Tauri 环境中则返回默认值或什么都不做
 * @param fn 要执行的 Tauri API 函数
 * @param fallbackValue 非 Tauri 环境下的返回值
 * @returns Promise<T> 或 fallbackValue
 */
export async function safeTauriCall<T>(
  fn: () => Promise<T>,
  fallbackValue?: T
): Promise<T | void> {
  if (isTauri()) {
    try {
      return await fn();
    } catch (error) {
      console.warn('Tauri API 调用失败:', error);
      return fallbackValue;
    }
  } else {
    console.warn('当前不在 Tauri 环境中，跳过 Tauri API 调用');
    return fallbackValue;
  }
}

/**
 * 安全地使用 Tauri 的监听器
 * @param fn 设置监听器的函数
 * @returns 清理函数或 undefined
 */
export function safeTauriListener(
  fn: () => Promise<() => void>
): (() => void) | undefined {
  if (!isTauri()) {
    console.warn('当前不在 Tauri 环境中，跳过监听器设置');
    return undefined;
  }

  let cleanup: (() => void) | undefined;

  fn()
    .then((unlisten) => {
      cleanup = unlisten;
    })
    .catch((error) => {
      console.warn('Tauri 监听器设置失败:', error);
    });

  return () => {
    if (cleanup) {
      cleanup();
    }
  };
}