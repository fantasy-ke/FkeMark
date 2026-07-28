export function normalizeCodeLanguage(value: unknown): string {
  const language = String(value ?? '').trim()
  const lowerLanguage = language.toLowerCase()
  if (!language || lowerLanguage === 'text' || lowerLanguage === 'plaintext') return ''
  return lowerLanguage === 'c#' || lowerLanguage === 'csharp' ? 'csharp' : language
}

export function normalizeCodeBlockLanguage(value: unknown): string {
  return normalizeCodeLanguage(value) || 'text'
}
