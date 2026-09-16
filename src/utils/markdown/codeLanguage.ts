export function normalizeCodeLanguage(value: unknown): string {
  const language = String(value ?? '').trim()
  const lowerLanguage = language.toLowerCase()
  if (!language || lowerLanguage === 'text' || lowerLanguage === 'plaintext') return ''
  return lowerLanguage === 'c#' || lowerLanguage === 'csharp' ? 'csharp' : language
}

const MERMAID_LANGUAGES = new Set(['mermaid', 'mmd'])

export function isMermaidLanguage(value: unknown): boolean {
  return MERMAID_LANGUAGES.has(String(value ?? '').trim().toLowerCase())
}

export function normalizeCodeBlockLanguage(value: unknown): string {
  return normalizeCodeLanguage(value) || 'text'
}
