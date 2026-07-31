import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf-8')

const themeNames = [
  'light',
  'dark',
  'ayu',
  'catppuccin',
  'codex',
  'dracula',
  'everforest',
  'github',
  'linear',
  'vercel',
  'vs-code-plus',
  'xcode',
]

const syntaxVariables = [
  '--syntax-comment',
  '--syntax-keyword',
  '--syntax-string',
  '--syntax-number',
  '--syntax-title',
  '--syntax-variable',
  '--syntax-attribute',
  '--syntax-meta',
  '--syntax-deletion',
]

interface CssRule {
  selectors: string
  declarations: Record<string, string>
}

interface RgbColor {
  r: number
  g: number
  b: number
}

function parseCssRules(css: string): CssRule[] {
  return Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g)).map((match) => ({
    selectors: match[1].trim(),
    declarations: Object.fromEntries(
      Array.from(match[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))
        .map((decl) => [decl[1], decl[2].trim()]),
    ),
  }))
}

function getThemeVariables(rules: CssRule[], theme: string): Record<string, string> {
  const variables: Record<string, string> = {}
  for (const rule of rules) {
    if (rule.selectors.includes(':root')) Object.assign(variables, rule.declarations)
    if (rule.selectors.includes(`[data-theme="${theme}"]`)) Object.assign(variables, rule.declarations)
  }
  return variables
}

function colorFromHex(value: string): RgbColor | null {
  const hex = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1]
  if (!hex) return null
  const normalized = hex.length === 3
    ? hex.split('').map((char) => char + char).join('')
    : hex
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

function resolveColorToken(
  token: string,
  variables: Record<string, string>,
  visited: Set<string>,
): RgbColor | null {
  const variableName = token.trim().match(/^var\((--[\w-]+)\)$/)?.[1]
  if (variableName) return resolveColorValue(variableName, variables, visited)
  return colorFromHex(token)
}

function mixColors(first: RgbColor, firstWeight: number, second: RgbColor, secondWeight: number): RgbColor {
  const total = firstWeight + secondWeight
  return {
    r: Math.round((first.r * firstWeight + second.r * secondWeight) / total),
    g: Math.round((first.g * firstWeight + second.g * secondWeight) / total),
    b: Math.round((first.b * firstWeight + second.b * secondWeight) / total),
  }
}

function resolveColorValue(
  variableName: string,
  variables: Record<string, string>,
  visited = new Set<string>(),
): RgbColor | null {
  if (visited.has(variableName)) return null
  visited.add(variableName)
  const value = variables[variableName]?.trim()
  if (!value) return null

  const direct = resolveColorToken(value, variables, visited)
  if (direct) return direct

  const mix = value.match(/^color-mix\(in srgb,\s*(var\(--[\w-]+\)|#[0-9a-f]{3,6})\s+([\d.]+)%,\s*(var\(--[\w-]+\)|#[0-9a-f]{3,6})\s+([\d.]+)%\)$/i)
  if (!mix) return null

  const first = resolveColorToken(mix[1], variables, visited)
  const second = resolveColorToken(mix[3], variables, visited)
  if (!first || !second) return null
  return mixColors(first, Number(mix[2]), second, Number(mix[4]))
}

function relativeLuminance({ r, g, b }: RgbColor): number {
  const channel = (value: number) => {
    const normalized = value / 255
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrastRatio(first: RgbColor, second: RgbColor): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second))
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second))
  return (lighter + 0.05) / (darker + 0.05)
}

describe('code block theme styles', () => {
  const variablesCss = readProjectFile('src/styles/variables.css')
  const editorCss = readProjectFile('src/styles/editor.css')
  const markdownCss = readProjectFile('src/styles/markdown.css')
  const appSource = readProjectFile('src/App.tsx')
  const editorLayoutSource = readProjectFile('src/components/editor/EditorLayout.tsx')

  it('uses dedicated code block background and top/bottom border variables', () => {
    expect(variablesCss).toContain('--code-block-bg:')
    expect(variablesCss).toContain('--code-block-border:')
    expect(editorCss).toContain('background: var(--code-block-bg);')
    expect(editorCss).toContain('border-top-color: var(--code-block-border);')
    expect(editorCss).toContain('border-bottom-color: var(--code-block-border);')
    expect(editorCss).toContain('.bn-block-content[data-content-type="codeBlock"]')
  })

  it('routes syntax tokens through theme-specific variables', () => {
    expect(variablesCss).toContain('--syntax-keyword:')
    expect(variablesCss).toContain('--syntax-string:')
    expect(variablesCss).toContain('--syntax-comment: #334155;')
    expect(variablesCss).toContain('--syntax-meta: #1e293b;')
    expect(variablesCss).toContain('--syntax-comment: #9ca3af;')
    expect(variablesCss).toContain('--syntax-comment: #374151;')
    expect(markdownCss).toContain('color: var(--syntax-keyword);')
    expect(markdownCss).toContain('color: var(--syntax-string);')
    expect(markdownCss).toContain('color: var(--syntax-comment);')
    expect(markdownCss).not.toContain('[data-theme-mode="dark"] .editor-inner .hljs-keyword')
  })

  it('keeps syntax token colors readable across dark and light themes', () => {
    const rules = parseCssRules(variablesCss)
    const failures = themeNames.flatMap((theme) => {
      const variables = getThemeVariables(rules, theme)
      const background = resolveColorValue('--code-block-bg', variables)
      if (!background) return [`${theme}: missing code block background`]

      return syntaxVariables.flatMap((variable) => {
        const color = resolveColorValue(variable, variables)
        if (!color) return [`${theme}: missing ${variable}`]
        const ratio = contrastRatio(color, background)
        return ratio >= 4.5 ? [] : [`${theme}: ${variable} contrast ${ratio.toFixed(2)}`]
      })
    })

    expect(failures).toEqual([])
  })

  it('keeps the language selector unobtrusive until hover or focus', () => {
    expect(editorCss).toMatch(/data-content-type="codeBlock"\]\s*>\s*div\s*>\s*select\s*\{[\s\S]*opacity: 0;/)
    expect(editorCss).toMatch(/data-content-type="codeBlock"\]:hover\s*>\s*div\s*>\s*select,[\s\S]*opacity: 1;/)
  })

  it('uses the app-level reactive system theme for live code blocks', () => {
    expect(appSource).toContain('const [systemDark, setSystemDark]')
    expect(editorLayoutSource).toContain('systemDark = false')
    expect(editorLayoutSource).not.toContain("window.matchMedia('(prefers-color-scheme: dark)').matches")
  })
})
