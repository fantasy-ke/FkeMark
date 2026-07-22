import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import pkg from './package.json'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // 显示版本号：CI 通过 VITE_APP_VERSION 注入（dev 构建为 dev-<SHA>，release 为 X.Y.Z）
    // 降级到 package.json version（本地开发 / 未注入时）
    // 注意：此版本号仅用于前端显示与更新比较，不影响 msi/nsis 打包版本号（后者由 Cargo.toml/tauri.conf.json 决定）
    __APP_VERSION__: JSON.stringify(process.env.VITE_APP_VERSION || pkg.version),
    // 构建通道：CI 通过 VITE_UPDATE_CHANNEL 注入（dev 构建为 'dev'，release 为 'latest'）
    __UPDATE_CHANNEL__: JSON.stringify(process.env.VITE_UPDATE_CHANNEL || 'latest'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  // Tauri开发配置
  clearScreen: false,
  server: {
    strictPort: true,
    port: 1420,
    host: '127.0.0.1',
    hmr: {
      protocol: 'ws',
      host: '127.0.0.1',
      port: 1421,
    },
  },
  // Tauri 生产模式使用 tauri://localhost 协议，
  // 资源路径必须是相对路径（./assets/...），
  // 否则 WebView 无法找到打包后的 JS/CSS 文件
  base: './',
  build: {
    target: 'ES2021',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // TipTap 编辑器相关大依赖
          if (id.includes('node_modules/@tiptap/')) return 'tiptap-vendor'
          // ProseMirror 底层（TipTap 依赖）
          if (id.includes('node_modules/prosemirror-')) return 'tiptap-vendor'
          // React 核心
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/scheduler/')) return 'react-vendor'
          // Tauri API
          if (id.includes('node_modules/@tauri-apps/')) return 'tauri-vendor'
          // 语法高亮引擎
          if (id.includes('node_modules/lowlight/') || id.includes('node_modules/highlight.js/')) return 'lowlight-vendor'
          // Markdown 双引擎（markdown-it + turndown）
          if (id.includes('node_modules/markdown-it/') || id.includes('node_modules/turndown/') || id.includes('node_modules/turndown-plugin-gfm/')) return 'markdown-vendor'
          // 数学公式渲染
          if (id.includes('node_modules/katex/')) return 'katex-vendor'
          // DOCX / ePub 导出依赖交由动态 import 自然分包
          if (/node_modules\/(jszip|lie|immediate|pako|readable-stream|core-util-is|inherits|isarray|process-nextick-args|safe-buffer|string_decoder|util-deprecate|setimmediate)\//.test(id)) return undefined
          // 其他 node_modules 统一归入 vendor
          if (id.includes('node_modules/')) return 'vendor'
        },
      },
    },
  }
})