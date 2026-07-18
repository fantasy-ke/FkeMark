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
        manualChunks: {
          // 将 TipTap 编辑器相关的大依赖拆分为独立 chunk
          'tiptap-vendor': [
            '@tiptap/react',
            '@tiptap/starter-kit',
            '@tiptap/extension-underline',
            '@tiptap/extension-highlight',
            '@tiptap/extension-link',
            '@tiptap/extension-text-style',
            '@tiptap/extension-task-list',
            '@tiptap/extension-task-item',
            '@tiptap/extension-ordered-list',
            '@tiptap/extension-code-block-lowlight',
            '@tiptap/extension-table',
            '@tiptap/extension-table-row',
            '@tiptap/extension-table-header',
            '@tiptap/extension-table-cell',
          ],
          // React 核心拆分
          'react-vendor': ['react', 'react-dom'],
        },
      },
    },
  }
})