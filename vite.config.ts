import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import pkg from './package.json'

const manualChunkGroups = [
  ['vendor-react', ['/node_modules/react/', '/node_modules/react-dom/', '/node_modules/scheduler/']],
  ['vendor-tauri', ['/node_modules/@tauri-apps/']],
  // Mantine 及其运行时依赖（滚动锁定、焦点管理、自伸缩输入等）。这些依赖目前几乎不产生
  // 运行时代码，但仍归入同一家族，避免后续它们真正生效时落进 vendor 兜底。
  ['vendor-ui', ['/node_modules/@mantine/', '/node_modules/@floating-ui/', '/node_modules/react-remove-scroll', '/node_modules/react-style-singleton/', '/node_modules/react-number-format/', '/node_modules/react-textarea-autosize/', '/node_modules/use-callback-ref/', '/node_modules/use-sidecar/', '/node_modules/use-composed-ref/', '/node_modules/use-latest/', '/node_modules/use-isomorphic-layout-effect/', '/node_modules/detect-node-es/', '/node_modules/get-nonce/', '/node_modules/tabbable/', '/node_modules/tslib/', '/node_modules/@babel/runtime/']],
  ['vendor-icons', ['/node_modules/lucide-react/']],
  ['vendor-blocknote', ['/node_modules/@blocknote/']],
  ['vendor-tiptap', ['/node_modules/@tiptap/', '/node_modules/prosemirror-', '/node_modules/@handlewithcare/prosemirror-inputrules/', '/node_modules/orderedmap/', '/node_modules/rope-sequence/', '/node_modules/w3c-keyname/', '/node_modules/fast-equals/']],
  ['vendor-collab', ['/node_modules/yjs/', '/node_modules/lib0/', '/node_modules/y-prosemirror/', '/node_modules/y-protocols/']],
  ['vendor-unified', ['/node_modules/unified/', '/node_modules/remark-', '/node_modules/rehype-', '/node_modules/micromark', '/node_modules/mdast-', '/node_modules/unist-', '/node_modules/vfile', '/node_modules/trough/', '/node_modules/markdown-table/', '/node_modules/stringify-entities/', '/node_modules/character-entities', '/node_modules/decode-named-character-reference/', '/node_modules/longest-streak/', '/node_modules/ccount/', '/node_modules/trim-lines/', '/node_modules/trim-trailing-lines/', '/node_modules/bail/', '/node_modules/zwitch/', '/node_modules/parse5/', '/node_modules/entities/', '/node_modules/property-information/', '/node_modules/hast-', '/node_modules/hastscript/', '/node_modules/html-void-elements/', '/node_modules/web-namespaces/', '/node_modules/space-separated-tokens/', '/node_modules/comma-separated-tokens/', '/node_modules/devlop/', '/node_modules/is-plain-obj/']],
  ['vendor-markdown', ['/node_modules/markdown-it/', '/node_modules/turndown/', '/node_modules/turndown-plugin-gfm/', '/node_modules/katex/', '/node_modules/yaml/']],
  ['vendor-zip', ['/node_modules/jszip/']],
  ['vendor-editor-misc', ['/node_modules/emoji-mart/', '/node_modules/linkifyjs/', '/node_modules/linkify-it/', '/node_modules/mdurl/', '/node_modules/punycode.js/', '/node_modules/@tanstack/', '/node_modules/@ungap/', '/node_modules/use-sync-external-store/', '/node_modules/uuid/', '/node_modules/uc.micro/', '/node_modules/extend/', '/node_modules/fast-deep-equal/', '/node_modules/clsx/']],
  // Mermaid 的私有依赖族。这些包只被懒加载的 mermaid 分块引用，所以单独成 chunk 后
  // 仍然是懒加载；如果它们落进 vendor 兜底，会和首屏共享依赖合并成同一个 chunk，
  // 使这些本应懒加载的内容被首屏静态加载。分包的依据是「加载时机」，不是体积。
  ['vendor-mermaid-diagram', ['/node_modules/cytoscape', '/node_modules/cose-base/', '/node_modules/layout-base/', '/node_modules/dagre-d3-es/', '/node_modules/khroma/', '/node_modules/@upsetjs/venn.js/']],
  ['vendor-mermaid-d3', ['/node_modules/d3-', '/node_modules/d3/', '/node_modules/internmap/', '/node_modules/delaunator/', '/node_modules/robust-predicates/']],
  ['vendor-mermaid-runtime', ['/node_modules/lodash-es/', '/node_modules/es-toolkit/', '/node_modules/dompurify/', '/node_modules/marked/', '/node_modules/roughjs/', '/node_modules/dayjs/', '/node_modules/fastdom/', '/node_modules/ts-dedent/', '/node_modules/stylis/', '/node_modules/@braintree/sanitize-url/', '/node_modules/@iconify/utils/']],
  // Shiki 的 JavaScript 正则引擎运行时。@shikijs/* 本体由 dynamicChunkPrefixes 保持动态分块，
  // 这里只归置常驻的引擎依赖，避免它们落进 vendor 兜底。
  ['vendor-shiki-engine', ['/node_modules/oniguruma-parser/', '/node_modules/oniguruma-to-es/', '/node_modules/regex/', '/node_modules/regex-recursion/', '/node_modules/regex-utilities/']],
  // BlockNote 表情面板按需加载的数据包。独立成 chunk 后仍只在该面板打开时加载；
  // 若并入 vendor 兜底，会随首屏共享依赖一起被静态加载。
  ['vendor-emoji-data', ['/node_modules/@emoji-mart/']],
] as const

const dynamicChunkPrefixes = [
  '/node_modules/@shikijs/',
  '/node_modules/mermaid/',
  '/node_modules/@mermaid-js/',
] as const

function shouldPreserveDynamicChunk(id: string): boolean {
  return dynamicChunkPrefixes.some((pattern) => id.includes(pattern))
}

function getManualChunkName(id: string): string | undefined {
  const normalizedId = id.replace(/\\/g, '/')

  // Rollup 的 CommonJS helper 会被 React chunk 使用；固定到 React chunk，避免 helper
  // 落入其它依赖分包后形成 vendor-react <-> vendor-* 循环依赖。
  if (normalizedId.includes('commonjsHelpers.js')) return 'vendor-react'

  if (!normalizedId.includes('node_modules')) return

  // Keep Shiki language/theme dynamic imports out of vendor chunks.
  if (shouldPreserveDynamicChunk(normalizedId)) return

  for (const [chunkName, patterns] of manualChunkGroups) {
    if (patterns.some((pattern) => normalizedId.includes(pattern))) {
      return chunkName
    }
  }

  // 兜底：仍未命中任何依赖族的模块统一进 vendor。这里要注意兜底的性质 —— 它会把
  // 「只服务懒加载功能的包」和「首屏共享依赖」合并进同一个 chunk，而该 chunk 会被
  // index 静态引用，于是懒加载依赖被提前到首屏加载。因此凡是只服务懒加载功能的依赖，
  // 都必须像上面的 mermaid 依赖族一样先拆成独立分组，不要指望靠 vendor 兜底收尾。
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
  optimizeDeps: {
    // Mermaid 11 用相对路径动态加载 erDiagram 等分块；预构建会把这些 import 打坏。
    exclude: ['mermaid'],
  },
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
