import { createLowlight } from 'lowlight'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import bash from 'highlight.js/lib/languages/bash'
import shell from 'highlight.js/lib/languages/shell'
import json from 'highlight.js/lib/languages/json'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import sql from 'highlight.js/lib/languages/sql'
import markdown from 'highlight.js/lib/languages/markdown'
import java from 'highlight.js/lib/languages/java'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import yaml from 'highlight.js/lib/languages/yaml'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import plaintext from 'highlight.js/lib/languages/plaintext'

/**
 * 配置 lowlight 实例：注册常用语言
 * 用于 TipTap CodeBlockLowlight 扩展的语法高亮
 */
export const lowlight = createLowlight({
  javascript,
  typescript,
  python,
  bash,
  shell,
  json,
  xml,
  css,
  sql,
  markdown,
  java,
  go,
  rust,
  c,
  cpp,
  csharp,
  yaml,
  dockerfile,
  plaintext,
})

// 注册常见别名
lowlight.registerAlias('javascript', 'js')
lowlight.registerAlias('javascript', 'jsx')
lowlight.registerAlias('typescript', 'ts')
lowlight.registerAlias('typescript', 'tsx')
lowlight.registerAlias('python', 'py')
lowlight.registerAlias('bash', 'sh')
lowlight.registerAlias('shell', 'zsh')
lowlight.registerAlias('xml', 'html')
lowlight.registerAlias('xml', 'svg')
lowlight.registerAlias('csharp', 'cs')
lowlight.registerAlias('cpp', 'c++')
lowlight.registerAlias('markdown', 'md')
