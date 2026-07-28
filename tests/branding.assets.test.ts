import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) => readFileSync(resolve(path), 'utf8')

describe('FkeMark branding assets', () => {
  it('keeps the app and documentation logo sources identical', () => {
    expect(readProjectFile('doc/public/logo.svg')).toBe(readProjectFile('public/logo.svg'))
  })

  it('uses the project palette and a scalable square canvas', () => {
    const logo = readProjectFile('public/logo.svg')

    expect(logo).toContain('viewBox="0 0 512 512"')
    expect(logo).toContain('#1F2937')
    expect(logo).toContain('#FAF9F6')
    expect(logo).toContain('#C96442')
    expect(logo).not.toContain('linearGradient')
  })

  it('uses the unified logo in the splash screen and icon generator', () => {
    expect(readProjectFile('index.html')).toContain('<img src="/logo.svg" alt="" />')
    expect(readProjectFile('index.html')).toContain('rel="icon" type="image/svg+xml" href="/logo.svg"')
    expect(readProjectFile('scripts/gen-icons.cjs')).toContain("path.join(rootDir, 'public', 'logo.svg')")
  })
})
