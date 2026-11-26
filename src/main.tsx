import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'
import { getAppliedTheme, isDarkTheme, normalizeTheme } from './utils/themes'

// Set default theme
if (typeof window !== 'undefined') {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const savedTheme = normalizeTheme(localStorage.getItem('theme') || 'system')
  document.documentElement.setAttribute('data-theme', getAppliedTheme(savedTheme, systemDark))
  document.documentElement.setAttribute('data-theme-mode', isDarkTheme(savedTheme, systemDark) ? 'dark' : 'light')
}

// 后台仅暂停装饰动画，不影响保存、导入或下载任务。
const updateWindowVisibility = () => document.documentElement.toggleAttribute('data-window-hidden', document.hidden)
document.addEventListener('visibilitychange', updateWindowVisibility)
updateWindowVisibility()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)