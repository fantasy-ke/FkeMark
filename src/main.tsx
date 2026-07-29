import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'
import { getAppliedTheme, isDarkTheme, normalizeTheme } from './utils/themes'
import { isMobileRuntime } from './utils/platform'

// Set default theme
if (typeof window !== 'undefined') {
  const syncMobileRuntimeClass = () => {
    document.documentElement.classList.toggle('mobile-runtime', isMobileRuntime())
  }
  syncMobileRuntimeClass()
  window.addEventListener('resize', syncMobileRuntimeClass)
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const savedTheme = normalizeTheme(localStorage.getItem('theme') || 'system')
  document.documentElement.setAttribute('data-theme', getAppliedTheme(savedTheme, systemDark))
  document.documentElement.setAttribute('data-theme-mode', isDarkTheme(savedTheme, systemDark) ? 'dark' : 'light')
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)