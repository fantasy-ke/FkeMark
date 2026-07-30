import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createRuntime, encodeMessage, readMessages } = require('../packages/fkemark-mcp-server/bin/fkemark-mcp-server.cjs')
const samePath = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value

describe('FkeMark MCP stdio server', () => {
  let tempDir: string
  let outsideDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'fkemark-mcp-'))
    outsideDir = mkdtempSync(join(tmpdir(), 'fkemark-mcp-outside-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
    rmSync(outsideDir, { recursive: true, force: true })
  })

  it('lists, reads, searches, and extracts Markdown outlines from allowed folders', () => {
    const notePath = join(tempDir, 'note.md')
    writeFileSync(notePath, '# Title\nBody keyword\n\n## Child\n', 'utf8')
    writeFileSync(join(tempDir, 'ignored.txt'), 'keyword', 'utf8')
    const runtime = createRuntime({ enabled: true, permissionMode: 'read-only', roots: [tempDir] })

    const list = runtime.callTool('list_markdown_files', { root: tempDir })
    expect(list.files.map((file: { path: string }) => samePath(file.path))).toContain(samePath(notePath))

    const read = runtime.callTool('read_markdown', { path: notePath })
    expect(read.content).toContain('Body keyword')

    const search = runtime.callTool('search_markdown', { query: 'keyword', root: tempDir })
    expect(search.matches.map((match: { path: string; line: number }) => ({ ...match, path: samePath(match.path) })))
      .toEqual([expect.objectContaining({ path: samePath(notePath), line: 2 })])

    const outline = runtime.callTool('get_markdown_outline', { path: notePath })
    expect(outline.headings).toEqual([
      { level: 1, text: 'Title', line: 1 },
      { level: 2, text: 'Child', line: 4 },
    ])
  })

  it('blocks writes in read-only mode and blocks paths outside allowed folders', () => {
    const runtime = createRuntime({ enabled: true, permissionMode: 'read-only', roots: [tempDir] })
    const allowedPath = join(tempDir, 'new.md')
    const outsidePath = join(outsideDir, 'outside.md')

    expect(() => runtime.callTool('write_markdown', { path: allowedPath, content: 'New' }))
      .toThrow(/higher MCP permission mode/)
    expect(() => runtime.callTool('read_markdown', { path: outsidePath }))
      .toThrow(/outside the allowed Markdown folders/)
  })

  it('allows Markdown writes and keeps deletes behind full access', () => {
    const notePath = join(tempDir, 'draft.md')
    const writeRuntime = createRuntime({ enabled: true, permissionMode: 'data-read-write', roots: [tempDir] })

    writeRuntime.callTool('write_markdown', { path: notePath, content: '# Draft\n' })
    writeRuntime.callTool('append_markdown', { path: notePath, content: 'More text\n' })
    expect(readFileSync(notePath, 'utf8')).toContain('More text')
    expect(() => writeRuntime.callTool('delete_markdown', { path: notePath }))
      .toThrow(/higher MCP permission mode/)

    const fullRuntime = createRuntime({ enabled: true, permissionMode: 'full-access', roots: [tempDir] })
    fullRuntime.callTool('delete_markdown', { path: notePath })
    expect(existsSync(notePath)).toBe(false)
  })

  it('handles framed JSON-RPC tool calls', () => {
    const notePath = join(tempDir, 'rpc.md')
    writeFileSync(notePath, '# RPC\n', 'utf8')
    const runtime = createRuntime({ enabled: true, permissionMode: 'read-only', roots: [tempDir] })
    const frame = encodeMessage({ jsonrpc: '2.0', id: 1, method: 'ping' })

    const discover = runtime.handleRequest({ jsonrpc: '2.0', id: 1, method: 'server/discover' })
    expect(discover.resultType).toBe('complete')
    expect(discover.supportedVersions).toContain('2025-11-25')
    const tools = runtime.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } },
    })
    expect(tools.resultType).toBe('complete')
    expect(tools.tools.map((tool: { name: string }) => tool.name)).toContain('read_markdown')
    expect(() => runtime.handleRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/list',
      params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2099-01-01' } },
    })).toThrow(/Unsupported protocol version/)

    expect(readMessages(frame).messages).toEqual([{ jsonrpc: '2.0', id: 1, method: 'ping' }])
    const response = runtime.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'read_markdown', arguments: { path: notePath } },
    })
    expect(response.isError).toBe(false)
    expect(response.structuredContent.content).toBe('# RPC\n')
  })
})
