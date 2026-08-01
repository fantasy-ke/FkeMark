import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

const rootPackage = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))
const mcpPackage = JSON.parse(
  readFileSync(resolve(process.cwd(), 'packages/fkemark-mcp-server/package.json'), 'utf8'),
)
const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/npm-mcp.yml'), 'utf8')
const binEntry = readFileSync(
  resolve(process.cwd(), 'packages/fkemark-mcp-server/bin/fkemark-mcp-server.cjs'),
  'utf8',
)

describe('FkeMark MCP npm package', () => {
  it('exposes a dependency-free CLI package for external agents', () => {
    expect(mcpPackage.name).toBe('fkemark-mcp-server')
    expect(mcpPackage.version).toBe(rootPackage.version)
    expect(mcpPackage.bin).toEqual({ 'fkemark-mcp-server': 'bin/fkemark-mcp-server.cjs' })
    expect(mcpPackage.files).toContain('bin/')
    expect(mcpPackage.files).toContain('README.md')
    expect(mcpPackage.dependencies).toBeUndefined()
    expect(mcpPackage.engines.node).toBe('>=18')
    expect(binEntry.startsWith('#!/usr/bin/env node')).toBe(true)
  })

  it('publishes and archives the CLI package from a dedicated workflow', () => {
    const parsed = parse(workflow)
    const steps = parsed.jobs.publish.steps
    const versionStep = steps.find((step: { name?: string }) => step.name === 'Write package version')
    const packStep = steps.find((step: { name?: string }) => step.name === 'Pack npm tarball')
    const publishModeStep = steps.find((step: { name?: string }) => step.name === 'Resolve publish mode')
    const publishStep = steps.find((step: { name?: string }) => step.name === 'Publish to npm')
    const skipStep = steps.find((step: { name?: string }) => step.name === 'Skip npm publish without publish mode')
    const uploadStep = steps.find((step: { name?: string }) => step.name === 'Upload npm package artifact')

    expect(parsed.on.push.tags).toEqual(['v*'])
    expect(parsed.on.workflow_dispatch.inputs.version.required).toBe(true)
    expect(parsed.on.workflow_dispatch.inputs.publish.default).toBe(false)
    expect(parsed.on.workflow_dispatch.inputs.publish.type).toBe('boolean')
    expect(parsed.permissions).toEqual({ contents: 'read' })
    expect(parsed.jobs.publish.env.NODE_AUTH_TOKEN).toBe('${{ secrets.NPM_TOKEN }}')
    expect(versionStep['working-directory']).toBe('${{ env.PACKAGE_DIR }}')
    expect(versionStep.run).toBe('npm version "${{ steps.meta.outputs.version }}" --no-git-tag-version --allow-same-version')
    expect(packStep['working-directory']).toBe('${{ env.PACKAGE_DIR }}')
    expect(packStep.run).toContain('npm pack --pack-destination "${GITHUB_WORKSPACE}/${PACK_DIR}"')
    expect(uploadStep.with.path).toBe('${{ env.PACK_DIR }}/*.tgz')
    expect(publishModeStep.id).toBe('publish-mode')
    expect(publishModeStep.run).toContain('MANUAL_PUBLISH')
    expect(publishModeStep.run).toContain('NPM_TOKEN is not configured')
    expect(publishStep.if).toBe("steps.publish-mode.outputs.enabled == 'true'")
    expect(publishStep['working-directory']).toBe('${{ env.PACKAGE_DIR }}')
    expect(publishStep.run).toBe('npm publish --access public')
    expect(skipStep.if).toBe("steps.publish-mode.outputs.enabled != 'true'")
  })
})
