import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf-8')

describe('settings section spacing', () => {
  const settingsPageCss = readProjectFile('src/styles/components/settings-page.css')

  it('keeps MCP custom blocks away from group borders', () => {
    expect(settingsPageCss).toContain('.settings-content .settings-group-body > .mcp-settings-note')
    expect(settingsPageCss).toContain('.settings-content .settings-group-body > .mcp-settings-config-example')
    expect(settingsPageCss).toContain('margin: 12px 16px;')
  })

  it('keeps About custom blocks away from group borders', () => {
    expect(settingsPageCss).toContain('.settings-content .settings-group-body > .about-desc')
    expect(settingsPageCss).toContain('.settings-content .settings-group-body > .about-links')
    expect(settingsPageCss).toContain('.settings-content .settings-group-body > .about-meta-row')
    expect(settingsPageCss).toContain('padding: 7px 16px;')
    expect(settingsPageCss).toContain('.settings-content .settings-group-body > .update-release-notes')
    expect(settingsPageCss).toContain('margin-inline: 16px;')
  })
})
