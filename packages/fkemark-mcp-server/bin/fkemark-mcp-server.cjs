#!/usr/bin/env node
const fs = require('fs')
const os = require('os')
const path = require('path')

const SERVER_NAME = 'fkemark-markdown-mcp'
const SERVER_VERSION = loadPackageVersion()
const MODERN_PROTOCOL_VERSION = '2026-07-28'
const LEGACY_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2024-11-05']
const SUPPORTED_PROTOCOL_VERSIONS = [MODERN_PROTOCOL_VERSION, ...LEGACY_PROTOCOL_VERSIONS]
const PROTOCOL_VERSION_META_KEY = 'io.modelcontextprotocol/protocolVersion'
const VALID_PERMISSION_MODES = new Set(['read-only', 'data-read-write', 'full-access'])
const READ_TOOLS = new Set(['list_markdown_files', 'read_markdown', 'search_markdown', 'get_markdown_outline'])
const WRITE_TOOLS = new Set(['write_markdown', 'append_markdown'])
const FULL_ACCESS_TOOLS = new Set(['delete_markdown'])
const TEXT_DECODER = new TextDecoder()

const TOOLS = [
  {
    name: 'list_markdown_files',
    title: 'List Markdown files',
    description: 'List .md and .markdown files from the allowed FkeMark folders.',
    inputSchema: {
      type: 'object',
      properties: {
        root: { type: 'string', description: 'Optional folder to list. It must be inside an allowed folder.' },
        maxDepth: { type: 'number', description: 'Maximum recursive depth. Default 6, maximum 20.' },
        limit: { type: 'number', description: 'Maximum file count. Default 200, maximum 1000.' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: 'read_markdown',
    title: 'Read Markdown',
    description: 'Read one Markdown file from the allowed FkeMark folders.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to a .md or .markdown file.' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: 'search_markdown',
    title: 'Search Markdown',
    description: 'Search Markdown files by plain text and return matching lines.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Plain text to search for.' },
        root: { type: 'string', description: 'Optional folder to search. It must be inside an allowed folder.' },
        caseSensitive: { type: 'boolean', description: 'Use case-sensitive matching. Default false.' },
        limit: { type: 'number', description: 'Maximum match count. Default 50, maximum 200.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: 'get_markdown_outline',
    title: 'Get Markdown outline',
    description: 'Extract heading levels, text, and line numbers from a Markdown file.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to a .md or .markdown file.' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: 'write_markdown',
    title: 'Write Markdown',
    description: 'Create or replace one Markdown file in the allowed FkeMark folders.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to a .md or .markdown file.' },
        content: { type: 'string', description: 'Markdown content to write.' },
        create: { type: 'boolean', description: 'Allow creating a missing file. Default true.' },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'append_markdown',
    title: 'Append Markdown',
    description: 'Append Markdown content to a file in the allowed FkeMark folders.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to a .md or .markdown file.' },
        content: { type: 'string', description: 'Markdown content to append.' },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'delete_markdown',
    title: 'Delete Markdown',
    description: 'Delete one Markdown file from the allowed FkeMark folders. Requires Full access.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to a .md or .markdown file.' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
  },
]

function loadPackageVersion() {
  try {
    return require('../package.json').version || '0.0.0'
  } catch (_error) {
    return '0.0.0'
  }
}

function createRuntime(options = {}) {
  const config = normalizeConfig(options)

  return {
    config,
    listTools() {
      return listToolsResult()
    },
    callTool(name, args = {}) {
      return callTool(config, name, args || {})
    },
    handleRequest(request) {
      return handleRequest(config, request)
    },
  }
}

function normalizeConfig(options = {}) {
  const env = options.env || process.env
  const settings = options.settings || loadSettings(env, options.settingsPath)
  const explicitEnabled = readBoolean(env.FKEMARK_MCP_ENABLED)
  const enabled = typeof options.enabled === 'boolean'
    ? options.enabled
    : explicitEnabled ?? Boolean(settings.mcpServiceEnabled)
  const permissionMode = normalizePermissionMode(
    options.permissionMode || env.FKEMARK_MCP_PERMISSION || settings.mcpPermissionMode,
  )
  const rootsValue = options.roots || env.FKEMARK_MCP_ROOTS || settings.mcpAllowedRoots
  const roots = normalizeRoots(rootsValue, options.cwd || process.cwd())

  return { enabled, permissionMode, roots, cwd: options.cwd || process.cwd() }
}

function loadSettings(env = process.env, explicitPath) {
  const settingsPath = explicitPath || env.FKEMARK_SETTINGS_PATH || getDefaultSettingsPath(env)
  if (!settingsPath || !fs.existsSync(settingsPath)) return {}

  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  } catch (_error) {
    return {}
  }
}

function getDefaultSettingsPath(env = process.env) {
  if (process.platform === 'win32') {
    const appData = env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    return path.join(appData, 'FkeMark', 'settings.json')
  }

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'FkeMark', 'settings.json')
  }

  return path.join(env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'FkeMark', 'settings.json')
}

function readBoolean(value) {
  if (value === undefined || value === null || value === '') return undefined
  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return undefined
}

function normalizePermissionMode(value) {
  const mode = String(value || 'data-read-write').trim()
  return VALID_PERMISSION_MODES.has(mode) ? mode : 'data-read-write'
}

function normalizeRoots(value, cwd) {
  const rawRoots = Array.isArray(value) ? value : splitRootList(value)
  const roots = rawRoots
    .map((root) => String(root || '').trim())
    .filter(Boolean)
    .map((root) => resolveExistingOrFuturePath(path.resolve(cwd, root)))

  return roots.length ? Array.from(new Set(roots.map(normalizeForCompare))).map((root) => ({ path: root })) : [{ path: resolveExistingOrFuturePath(cwd) }]
}

function splitRootList(value) {
  if (!value) return []
  const byLine = String(value).split(/\r?\n/)
  return byLine.flatMap((line) => line.split(path.delimiter))
}

function callTool(config, name, args) {
  ensureEnabled(config)
  ensureToolAllowed(config.permissionMode, name)

  switch (name) {
    case 'list_markdown_files':
      return listMarkdownFiles(config, args)
    case 'read_markdown':
      return readMarkdown(config, args)
    case 'search_markdown':
      return searchMarkdown(config, args)
    case 'get_markdown_outline':
      return getMarkdownOutline(config, args)
    case 'write_markdown':
      return writeMarkdown(config, args)
    case 'append_markdown':
      return appendMarkdown(config, args)
    case 'delete_markdown':
      return deleteMarkdown(config, args)
    default:
      throw new UserError(`Unknown tool: ${name}`)
  }
}

function ensureEnabled(config) {
  if (!config.enabled) {
    throw new UserError('FkeMark MCP service is disabled. Enable it in Settings > MCP or set FKEMARK_MCP_ENABLED=1.')
  }
}

function ensureToolAllowed(mode, name) {
  if (READ_TOOLS.has(name)) return
  if (WRITE_TOOLS.has(name) && mode !== 'read-only') return
  if (FULL_ACCESS_TOOLS.has(name) && mode === 'full-access') return

  throw new UserError(`Tool ${name} requires a higher MCP permission mode than ${mode}.`)
}

function listMarkdownFiles(config, args) {
  const limit = clampInteger(args.limit, 200, 1, 1000)
  const maxDepth = clampInteger(args.maxDepth, 6, 0, 20)
  const roots = args.root ? [resolveDirectory(config, args.root)] : existingRoots(config)
  const files = []
  const visited = new Set()

  for (const root of roots) {
    walkMarkdown(root, 0, maxDepth, limit, files, visited, config)
    if (files.length >= limit) break
  }

  return {
    roots: roots.map((root) => root.path),
    count: files.length,
    truncated: files.length >= limit,
    files,
  }
}

function readMarkdown(config, args) {
  const target = resolveMarkdownFile(config, requiredString(args, 'path'), { mustExist: true })
  const content = fs.readFileSync(target.path, 'utf8')
  const stat = fs.statSync(target.path)

  return {
    path: target.path,
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    content,
  }
}

function searchMarkdown(config, args) {
  const query = requiredString(args, 'query')
  if (!query) throw new UserError('query cannot be empty.')

  const limit = clampInteger(args.limit, 50, 1, 200)
  const caseSensitive = Boolean(args.caseSensitive)
  const needle = caseSensitive ? query : query.toLowerCase()
  const roots = args.root ? [resolveDirectory(config, args.root)] : existingRoots(config)
  const files = []
  const visited = new Set()
  for (const root of roots) {
    walkMarkdown(root, 0, 20, 1000, files, visited, config)
  }

  const matches = []
  for (const file of files) {
    const content = fs.readFileSync(file.path, 'utf8')
    const lines = content.split(/\r?\n/)
    for (let i = 0; i < lines.length; i += 1) {
      const haystack = caseSensitive ? lines[i] : lines[i].toLowerCase()
      const column = haystack.indexOf(needle)
      if (column !== -1) {
        matches.push({ path: file.path, line: i + 1, column: column + 1, preview: lines[i].trim() })
        if (matches.length >= limit) {
          return { query, count: matches.length, truncated: true, matches }
        }
      }
    }
  }

  return { query, count: matches.length, truncated: false, matches }
}

function getMarkdownOutline(config, args) {
  const target = resolveMarkdownFile(config, requiredString(args, 'path'), { mustExist: true })
  const content = fs.readFileSync(target.path, 'utf8')
  const headings = []
  let inFence = false
  const lines = content.split(/\r?\n/)

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (match) headings.push({ level: match[1].length, text: match[2].trim(), line: i + 1 })
  }

  return { path: target.path, count: headings.length, headings }
}

function writeMarkdown(config, args) {
  const content = requiredString(args, 'content')
  const target = resolveMarkdownFile(config, requiredString(args, 'path'), { mustExist: false })
  if (args.create === false && !fs.existsSync(target.path)) {
    throw new UserError(`File does not exist: ${target.path}`)
  }

  fs.mkdirSync(path.dirname(target.path), { recursive: true })
  fs.writeFileSync(target.path, content, 'utf8')
  const stat = fs.statSync(target.path)
  return { path: target.path, size: stat.size, modifiedAt: stat.mtime.toISOString() }
}

function appendMarkdown(config, args) {
  const content = requiredString(args, 'content')
  const target = resolveMarkdownFile(config, requiredString(args, 'path'), { mustExist: false })
  fs.mkdirSync(path.dirname(target.path), { recursive: true })
  fs.appendFileSync(target.path, content, 'utf8')
  const stat = fs.statSync(target.path)
  return { path: target.path, size: stat.size, modifiedAt: stat.mtime.toISOString() }
}

function deleteMarkdown(config, args) {
  const target = resolveMarkdownFile(config, requiredString(args, 'path'), { mustExist: true })
  const stat = fs.statSync(target.path)
  if (!stat.isFile()) throw new UserError(`Not a file: ${target.path}`)

  fs.unlinkSync(target.path)
  return { path: target.path, deleted: true }
}

function walkMarkdown(root, depth, maxDepth, limit, files, visited, config) {
  if (files.length >= limit || depth > maxDepth || !fs.existsSync(root.path)) return
  const rootReal = resolveExistingOrFuturePath(root.path)
  if (visited.has(rootReal)) return
  visited.add(rootReal)

  const entries = safeReadDir(root.path)
  for (const entry of entries) {
    if (files.length >= limit) break
    const entryPath = path.join(root.path, entry.name)
    const entryReal = resolveExistingOrFuturePath(entryPath)
    if (!isAllowedResolvedPath(config, entryReal)) continue

    if (entry.isDirectory()) {
      walkMarkdown({ path: entryPath }, depth + 1, maxDepth, limit, files, visited, config)
    } else if (entry.isFile() && isMarkdownFile(entryPath)) {
      const stat = fs.statSync(entryPath)
      files.push({ path: entryReal, size: stat.size, modifiedAt: stat.mtime.toISOString() })
    }
  }
}

function safeReadDir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
  } catch (_error) {
    return []
  }
}

function existingRoots(config) {
  const roots = config.roots.filter((root) => fs.existsSync(root.path) && fs.statSync(root.path).isDirectory())
  return roots.length ? roots : config.roots
}

function resolveDirectory(config, rawPath) {
  const resolved = resolveTarget(config, rawPath)
  if (!fs.existsSync(resolved.path)) throw new UserError(`Folder does not exist: ${resolved.path}`)
  if (!fs.statSync(resolved.path).isDirectory()) throw new UserError(`Not a folder: ${resolved.path}`)
  return resolved
}

function resolveMarkdownFile(config, rawPath, { mustExist }) {
  const resolved = resolveTarget(config, rawPath)
  if (!isMarkdownFile(resolved.path)) {
    throw new UserError('Only .md and .markdown files are allowed.')
  }
  if (mustExist && !fs.existsSync(resolved.path)) {
    throw new UserError(`File does not exist: ${resolved.path}`)
  }
  if (mustExist && !fs.statSync(resolved.path).isFile()) {
    throw new UserError(`Not a file: ${resolved.path}`)
  }
  return resolved
}

function resolveTarget(config, rawPath) {
  const value = requiredPath(rawPath)
  const absolute = path.resolve(config.cwd, value)
  const resolved = resolveExistingOrFuturePath(absolute)
  if (!isAllowedResolvedPath(config, resolved)) {
    throw new UserError(`Path is outside the allowed Markdown folders: ${absolute}`)
  }
  return { path: resolved }
}

function isAllowedResolvedPath(config, resolved) {
  return config.roots.some((root) => isSameOrChildPath(resolved, root.path))
}

function resolveExistingOrFuturePath(absolutePath) {
  let current = path.resolve(absolutePath)
  const tail = []

  while (!fs.existsSync(current)) {
    const parent = path.dirname(current)
    if (parent === current) break
    tail.unshift(path.basename(current))
    current = parent
  }

  const base = fs.existsSync(current) ? realpath(current) : path.resolve(current)
  return normalizeForCompare(path.join(base, ...tail))
}

function realpath(value) {
  try {
    return fs.realpathSync.native(value)
  } catch (_error) {
    return path.resolve(value)
  }
}

function normalizeForCompare(value) {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function isSameOrChildPath(child, parent) {
  const normalizedChild = normalizeForCompare(child)
  const normalizedParent = normalizeForCompare(parent)
  const relative = path.relative(normalizedParent, normalizedChild)
  return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}

function isMarkdownFile(value) {
  const ext = path.extname(value).toLowerCase()
  return ext === '.md' || ext === '.markdown'
}

function requiredString(args, key) {
  const value = args[key]
  if (typeof value !== 'string') throw new UserError(`${key} must be a string.`)
  return value
}

function requiredPath(value) {
  if (typeof value !== 'string' || !value.trim()) throw new UserError('path must be a non-empty string.')
  return value
}

function clampInteger(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(number)))
}


function ensureSupportedRequestVersion(request) {
  if (request.method === 'server/discover' || request.method === 'initialize' || request.method === 'ping') return
  const requested = requestProtocolVersion(request)
  if (requested && !SUPPORTED_PROTOCOL_VERSIONS.includes(requested)) {
    throw new RpcError(-32022, 'Unsupported protocol version', { requested, supported: SUPPORTED_PROTOCOL_VERSIONS })
  }
}

function requestProtocolVersion(request) {
  const params = request.params
  if (!params || typeof params !== 'object') return undefined
  const meta = params._meta
  if (!meta || typeof meta !== 'object') return undefined
  return typeof meta[PROTOCOL_VERSION_META_KEY] === 'string' ? meta[PROTOCOL_VERSION_META_KEY] : undefined
}

function handleRequest(config, request) {
  if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
    throw new RpcError(-32600, 'Invalid Request')
  }

  ensureSupportedRequestVersion(request)


  switch (request.method) {
    case 'server/discover':
      return discoverResult()
    case 'initialize':
      return initializeResult(request.params || {})
    case 'ping':
      return {}
    case 'tools/list':
      return listToolsResult()
    case 'tools/call':
      return handleToolCall(config, request.params || {})
    default:
      throw new RpcError(-32601, `Method not found: ${request.method}`)
  }
}

function listToolsResult() {
  return { resultType: 'complete', tools: TOOLS }
}

function discoverResult() {
  return {
    resultType: 'complete',
    supportedVersions: SUPPORTED_PROTOCOL_VERSIONS,
    capabilities: { tools: {} },
    _meta: { 'io.modelcontextprotocol/serverInfo': serverInfo() },
    instructions: 'Use FkeMark tools only for Markdown files in the configured allowed folders.',
    ttlMs: 3600000,
    cacheScope: 'public',
  }
}

function initializeResult(params) {
  const requested = params.protocolVersion
  const protocolVersion = LEGACY_PROTOCOL_VERSIONS.includes(requested) ? requested : LEGACY_PROTOCOL_VERSIONS[0]
  return {
    protocolVersion,
    capabilities: { tools: { listChanged: false } },
    serverInfo: serverInfo(),
    instructions: 'Use FkeMark tools only for Markdown files in the configured allowed folders.',
  }
}

function serverInfo() {
  return {
    name: SERVER_NAME,
    title: 'FkeMark Markdown MCP',
    version: SERVER_VERSION,
  }
}

function handleToolCall(config, params) {
  if (!params || typeof params.name !== 'string') {
    throw new RpcError(-32602, 'Tool name is required')
  }
  if (!TOOLS.some((tool) => tool.name === params.name)) {
    throw new RpcError(-32602, `Unknown tool: ${params.name}`)
  }

  try {
    return toolResult(callTool(config, params.name, params.arguments || {}))
  } catch (error) {
    if (error instanceof UserError) return toolError(error.message)
    throw error
  }
}

function toolResult(value) {
  const text = JSON.stringify(value, null, 2)
  return { resultType: 'complete', content: [{ type: 'text', text }], structuredContent: value, isError: false }
}

function toolError(message) {
  return { resultType: 'complete', content: [{ type: 'text', text: message }], isError: true }
}

function runStdioServer(runtime = createRuntime()) {
  let buffer = Buffer.alloc(0)

  process.stdin.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    const parsed = readMessages(buffer)
    buffer = parsed.remaining

    for (const request of parsed.messages) {
      if (request.id === undefined || request.id === null) continue
      writeJsonRpcResponse(request.id, () => runtime.handleRequest(request))
    }
  })
}

function readMessages(buffer) {
  const messages = []
  let offset = 0

  while (offset < buffer.length) {
    const headerEnd = buffer.indexOf('\r\n\r\n', offset)
    if (headerEnd === -1) break

    const header = buffer.subarray(offset, headerEnd).toString('ascii')
    const match = /Content-Length:\s*(\d+)/i.exec(header)
    if (!match) throw new RpcError(-32700, 'Missing Content-Length header')

    const length = Number(match[1])
    const bodyStart = headerEnd + 4
    const bodyEnd = bodyStart + length
    if (buffer.length < bodyEnd) break

    const raw = buffer.subarray(bodyStart, bodyEnd)
    messages.push(JSON.parse(TEXT_DECODER.decode(raw)))
    offset = bodyEnd
  }

  return { messages, remaining: buffer.subarray(offset) }
}

function encodeMessage(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8')
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'), body])
}

function writeJsonRpcResponse(id, execute) {
  try {
    const result = execute()
    process.stdout.write(encodeMessage({ jsonrpc: '2.0', id, result }))
  } catch (error) {
    const rpcError = error instanceof RpcError ? error : new RpcError(-32603, errorMessage(error))
    process.stdout.write(encodeMessage({ jsonrpc: '2.0', id, error: rpcError.toJSON() }))
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

class UserError extends Error {}

class RpcError extends Error {
  constructor(code, message, data) {
    super(message)
    this.code = code
    this.data = data
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      ...(this.data === undefined ? {} : { data: this.data }),
    }
  }
}

if (require.main === module) {
  runStdioServer()
}

module.exports = {
  TOOLS,
  createRuntime,
  readMessages,
  encodeMessage,
  getDefaultSettingsPath,
}
