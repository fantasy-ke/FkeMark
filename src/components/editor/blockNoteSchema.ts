import {
  BlockNoteSchema,
  createCodeBlockSpec,
  defaultBlockSpecs,
  type CodeBlockOptions,
} from '@blocknote/core'
import { createBundledHighlighter } from '@shikijs/core'
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript'
import type { DynamicImportLanguageRegistration, DynamicImportThemeRegistration } from '@shikijs/types'

const bundledLanguages = {
  c: () => import('@shikijs/langs-precompiled/c'),
  cpp: () => import('@shikijs/langs/cpp'),
  csharp: () => import('@shikijs/langs-precompiled/csharp'),
  css: () => import('@shikijs/langs-precompiled/css'),
  dart: () => import('@shikijs/langs-precompiled/dart'),
  dockerfile: () => import('@shikijs/langs-precompiled/dockerfile'),
  elixir: () => import('@shikijs/langs-precompiled/elixir'),
  glsl: () => import('@shikijs/langs-precompiled/glsl'),
  go: () => import('@shikijs/langs-precompiled/go'),
  graphql: () => import('@shikijs/langs-precompiled/graphql'),
  haskell: () => import('@shikijs/langs-precompiled/haskell'),
  html: () => import('@shikijs/langs-precompiled/html'),
  java: () => import('@shikijs/langs-precompiled/java'),
  javascript: () => import('@shikijs/langs-precompiled/javascript'),
  json: () => import('@shikijs/langs-precompiled/json'),
  jsonc: () => import('@shikijs/langs-precompiled/jsonc'),
  jsonl: () => import('@shikijs/langs-precompiled/jsonl'),
  jsx: () => import('@shikijs/langs-precompiled/jsx'),
  kotlin: () => import('@shikijs/langs-precompiled/kotlin'),
  latex: () => import('@shikijs/langs-precompiled/latex'),
  less: () => import('@shikijs/langs-precompiled/less'),
  lua: () => import('@shikijs/langs-precompiled/lua'),
  markdown: () => import('@shikijs/langs-precompiled/markdown'),
  mermaid: () => import('@shikijs/langs-precompiled/mermaid'),
  perl: () => import('@shikijs/langs-precompiled/perl'),
  php: () => import('@shikijs/langs-precompiled/php'),
  python: () => import('@shikijs/langs-precompiled/python'),
  r: () => import('@shikijs/langs-precompiled/r'),
  ruby: () => import('@shikijs/langs-precompiled/ruby'),
  rust: () => import('@shikijs/langs-precompiled/rust'),
  sass: () => import('@shikijs/langs-precompiled/sass'),
  scala: () => import('@shikijs/langs-precompiled/scala'),
  scss: () => import('@shikijs/langs-precompiled/scss'),
  shellscript: () => import('@shikijs/langs-precompiled/shellscript'),
  sql: () => import('@shikijs/langs-precompiled/sql'),
  svelte: () => import('@shikijs/langs-precompiled/svelte'),
  swift: () => import('@shikijs/langs-precompiled/swift'),
  tsx: () => import('@shikijs/langs-precompiled/tsx'),
  typescript: () => import('@shikijs/langs-precompiled/typescript'),
  vue: () => import('@shikijs/langs-precompiled/vue'),
  xml: () => import('@shikijs/langs-precompiled/xml'),
  yaml: () => import('@shikijs/langs-precompiled/yaml'),
} satisfies Record<string, DynamicImportLanguageRegistration>

const bundledThemes = {
  'github-dark': () => import('@shikijs/themes/github-dark'),
  'github-light-high-contrast': () => import('@shikijs/themes/github-light-high-contrast'),
} satisfies Record<string, DynamicImportThemeRegistration>

const createFkeMarkHighlighter = createBundledHighlighter({
  langs: bundledLanguages,
  themes: bundledThemes,
  engine: () => createJavaScriptRegexEngine(),
})

type FkeMarkCodeTheme = 'github-dark' | 'github-light-high-contrast'

function getPreferredCodeTheme(): FkeMarkCodeTheme {
  if (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme-mode') === 'dark') {
    return 'github-dark'
  }

  return 'github-light-high-contrast'
}

function getCodeThemeLoadOrder(): FkeMarkCodeTheme[] {
  const preferred = getPreferredCodeTheme()
  return preferred === 'github-dark'
    ? ['github-dark', 'github-light-high-contrast']
    : ['github-light-high-contrast', 'github-dark']
}

export const fkeMarkCodeBlockOptions = {
  defaultLanguage: 'text',
  supportedLanguages: {
    text: { name: 'Plain Text', aliases: ['text', 'txt', 'plain', 'plaintext'] },
    javascript: { name: 'JavaScript', aliases: ['javascript', 'js'] },
    typescript: { name: 'TypeScript', aliases: ['typescript', 'ts'] },
    jsx: { name: 'JSX', aliases: ['jsx'] },
    tsx: { name: 'TSX', aliases: ['tsx', 'typescriptreact'] },
    python: { name: 'Python', aliases: ['python', 'py'] },
    shellscript: { name: 'Shell', aliases: ['shellscript', 'bash', 'sh', 'shell', 'zsh'] },
    json: { name: 'JSON', aliases: ['json'] },
    jsonc: { name: 'JSON with Comments', aliases: ['jsonc'] },
    jsonl: { name: 'JSON Lines', aliases: ['jsonl'] },
    xml: { name: 'XML', aliases: ['xml'] },
    html: { name: 'HTML', aliases: ['html'] },
    css: { name: 'CSS', aliases: ['css'] },
    scss: { name: 'SCSS', aliases: ['scss'] },
    sass: { name: 'Sass', aliases: ['sass'] },
    sql: { name: 'SQL', aliases: ['sql'] },
    markdown: { name: 'Markdown', aliases: ['markdown', 'md'] },
    java: { name: 'Java', aliases: ['java'] },
    go: { name: 'Go', aliases: ['go'] },
    rust: { name: 'Rust', aliases: ['rust', 'rs'] },
    c: { name: 'C', aliases: ['c'] },
    cpp: { name: 'C++', aliases: ['cpp', 'c++'] },
    csharp: { name: 'csharp', aliases: ['csharp', 'cs'] },
    yaml: { name: 'YAML', aliases: ['yaml', 'yml'] },
    dockerfile: { name: 'Dockerfile', aliases: ['dockerfile', 'docker'] },
    php: { name: 'PHP', aliases: ['php'] },
    ruby: { name: 'Ruby', aliases: ['ruby', 'rb'] },
    kotlin: { name: 'Kotlin', aliases: ['kotlin', 'kt', 'kts'] },
    swift: { name: 'Swift', aliases: ['swift'] },
    scala: { name: 'Scala', aliases: ['scala'] },
    perl: { name: 'Perl', aliases: ['perl'] },
    lua: { name: 'Lua', aliases: ['lua'] },
    r: { name: 'R', aliases: ['r'] },
    dart: { name: 'Dart', aliases: ['dart'] },
    elixir: { name: 'Elixir', aliases: ['elixir', 'ex'] },
    haskell: { name: 'Haskell', aliases: ['haskell', 'hs'] },
    vue: { name: 'Vue', aliases: ['vue'] },
    svelte: { name: 'Svelte', aliases: ['svelte'] },
    graphql: { name: 'GraphQL', aliases: ['graphql', 'gql'] },
    glsl: { name: 'GLSL', aliases: ['glsl'] },
    less: { name: 'Less', aliases: ['less'] },
    latex: { name: 'LaTeX', aliases: ['latex'] },
    mermaid: { name: 'Mermaid', aliases: ['mermaid', 'mmd'] },
  },
  createHighlighter: async () => createFkeMarkHighlighter({
    themes: getCodeThemeLoadOrder(),
    langs: [],
  }),
} satisfies CodeBlockOptions

export const fkeMarkBlockNoteSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock: createCodeBlockSpec(fkeMarkCodeBlockOptions),
  },
})
