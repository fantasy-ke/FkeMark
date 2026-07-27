import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import pkg from './package.json'

const manualChunkGroups = [
  ['vendor-react', ['/node_modules/react/', '/node_modules/react-dom/', '/node_modules/scheduler/']],
  ['vendor-tauri', ['/node_modules/@tauri-apps/']],
  ['vendor-ui', ['/node_modules/@mantine/', '/node_modules/@floating-ui/']],
  ['vendor-icons', ['/node_modules/lucide-react/']],
  ['vendor-blocknote', ['/node_modules/@blocknote/']],
  ['vendor-tiptap', ['/node_modules/@tiptap/', '/node_modules/prosemirror-', '/node_modules/@handlewithcare/prosemirror-inputrules/', '/node_modules/orderedmap/', '/node_modules/rope-sequence/', '/node_modules/w3c-keyname/']],
  ['vendor-collab', ['/node_modules/yjs/', '/node_modules/lib0/', '/node_modules/y-prosemirror/', '/node_modules/y-protocols/']],
  ['vendor-html-parser', ['/node_modules/parse5/', '/node_modules/entities/', '/node_modules/property-information/', '/node_modules/hast-', '/node_modules/hastscript/', '/node_modules/html-void-elements/', '/node_modules/web-namespaces/', '/node_modules/space-separated-tokens/', '/node_modules/comma-separated-tokens/']],
  ['vendor-unified', ['/node_modules/unified/', '/node_modules/remark-', '/node_modules/rehype-', '/node_modules/micromark', '/node_modules/mdast-', '/node_modules/unist-', '/node_modules/vfile', '/node_modules/trough/', '/node_modules/markdown-table/', '/node_modules/stringify-entities/', '/node_modules/character-entities', '/node_modules/decode-named-character-reference/', '/node_modules/longest-streak/', '/node_modules/ccount/', '/node_modules/trim-lines/', '/node_modules/trim-trailing-lines/', '/node_modules/bail/', '/node_modules/zwitch/']],
  ['vendor-markdown', ['/node_modules/markdown-it/', '/node_modules/turndown/', '/node_modules/turndown-plugin-gfm/', '/node_modules/katex/', '/node_modules/yaml/']],
  ['vendor-highlighting', ['/node_modules/lowlight/', '/node_modules/highlight.js/']],
  ['vendor-zip', ['/node_modules/jszip/']],
  ['vendor-editor-misc', ['/node_modules/emoji-mart/', '/node_modules/linkifyjs/', '/node_modules/linkify-it/', '/node_modules/mdurl/', '/node_modules/punycode.js/', '/node_modules/@tanstack/', '/node_modules/@ungap/', '/node_modules/use-sync-external-store/', '/node_modules/uuid/', '/node_modules/uc.micro/', '/node_modules/extend/', '/node_modules/fast-deep-equal/', '/node_modules/clsx/']],
] as const

const dynamicChunkPrefixes = [
  '/node_modules/@shikijs/',
] as const

function shouldPreserveDynamicChunk(id: string): boolean {
  return dynamicChunkPrefixes.some((pattern) => id.includes(pattern))
}

function getManualChunkName(id: string): string | undefined {
  if (!id.includes('node_modules')) return

  const normalizedId = id.replace(/\\/g, '/')
  // Keep Shiki language/theme dynamic imports out of vendor chunks.
  if (shouldPreserveDynamicChunk(normalizedId)) return

  for (const [chunkName, patterns] of manualChunkGroups) {
    if (patterns.some((pattern) => normalizedId.includes(pattern))) {
      return chunkName
    }
  }

  return 'vendor'
}

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
    // Rare Shiki grammar chunks (for example Ruby/C++) are lazy-loaded after language selection.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          return getManualChunkName(id)
        },
      },
    },
  }
})
