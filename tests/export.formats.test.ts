import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { buildDocx, buildEpub, buildOpml, buildRtf } from '../src/utils/exportFormats'
import { convertForExport } from '../src/utils/importExport'
import { renderExportHtml } from '../src/utils/markdown/engine'

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: '<svg class="mermaid-test"></svg>' })),
  },
}))

function parseXml(xml: string | undefined): XMLDocument {
  expect(xml).toBeTypeOf('string')
  const document = new DOMParser().parseFromString(xml || '', 'application/xml')
  expect(document.querySelector('parsererror')).toBeNull()
  return document
}

const markdown = [
  '---',
  'title: 发布文档',
  'author: fantasy-ke',
  '---',
  '',
  '# 第一章',
  '',
  '正文包含 **粗体** 和 [链接](https://example.com)。',
  '',
  '- 条目一',
  '- 条目二',
  '',
  '| 名称 | 内容 |',
  '| --- | --- |',
  '| 格式 | Markdown |',
  '',
  '## 子章节',
  '',
  '补充说明。',
].join('\n')

const excalidrawScene = JSON.stringify({
  type: 'excalidraw',
  version: 2,
  elements: [{ type: 'rectangle', x: 10, y: 20, width: 80, height: 40, strokeColor: '#1e1e1e' }],
  appState: {},
  files: {},
})

const excalidrawMarkdown = `# 图\n\n\`\`\`excalidraw\n${excalidrawScene}\n\`\`\``

describe('扩展导出格式', () => {

  it('生成包含 Unicode 和基础富文本控制字的 RTF', () => {
    const rtf = buildRtf(markdown)

    expect(rtf).toMatch(/^\{\\rtf1/)
    expect(rtf).toContain('\\b ')
    expect(rtf).toContain('\\u31532?')
    expect(rtf).not.toContain('title: 发布文档')
  })

  it('按标题层级生成 OPML 大纲并保留段落备注', () => {
    const opml = buildOpml(markdown)
    const xml = new DOMParser().parseFromString(opml, 'application/xml')
    const root = xml.querySelector('body > outline[text="第一章"]')
    const child = root?.querySelector(':scope > outline[text="子章节"]')

    expect(xml.querySelector('parsererror')).toBeNull()
    expect(xml.querySelector('head > title')?.textContent).toBe('发布文档')
    expect(root?.getAttribute('_note')).toContain('正文包含 粗体 和 链接')
    expect(child?.getAttribute('_note')).toContain('补充说明')
  })

  it('生成可解包且包含正文、表格和元数据的 DOCX', async () => {
    const bytes = await buildDocx(markdown)
    const zip = await JSZip.loadAsync(bytes)
    const documentXml = await zip.file('word/document.xml')?.async('string')
    const coreXml = await zip.file('docProps/core.xml')?.async('string')

    expect(zip.file('[Content_Types].xml')).not.toBeNull()
    expect(zip.file('word/styles.xml')).not.toBeNull()
    parseXml(documentXml)
    parseXml(coreXml)
    expect(documentXml).toContain('>第一章</w:t>')
    expect(documentXml).toContain('<w:tbl>')
    expect(documentXml).not.toContain('title: 发布文档')
    expect(coreXml).toContain('<dc:title>发布文档</dc:title>')
    expect(coreXml).toContain('<dc:creator>fantasy-ke</dc:creator>')
  })

  it('生成符合基本 ePub 3 结构的电子书包', async () => {
    const bytes = await buildEpub(markdown, 'zh-CN')
    const zip = await JSZip.loadAsync(bytes)
    const mimetype = await zip.file('mimetype')?.async('string')
    const packageXml = await zip.file('OEBPS/content.opf')?.async('string')
    const chapter = await zip.file('OEBPS/chapter.xhtml')?.async('string')
    const nav = await zip.file('OEBPS/nav.xhtml')?.async('string')
    const container = await zip.file('META-INF/container.xml')?.async('string')
    const archive = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const firstNameLength = archive.getUint16(26, true)
    const firstName = new TextDecoder().decode(bytes.slice(30, 30 + firstNameLength))

    expect(archive.getUint32(0, true)).toBe(0x04034b50)
    expect(archive.getUint16(8, true)).toBe(0)
    expect(firstName).toBe('mimetype')
    expect(mimetype).toBe('application/epub+zip')
    expect(zip.file('META-INF/container.xml')).not.toBeNull()
    parseXml(container)
    parseXml(packageXml)
    parseXml(chapter)
    parseXml(nav)
    expect(packageXml).toContain('<dc:title>发布文档</dc:title>')
    expect(packageXml).toContain('<dc:creator>fantasy-ke</dc:creator>')
    expect(chapter).toContain('<h1 id="heading-1">第一章</h1>')
    expect(chapter).toContain('<strong>粗体</strong>')
    expect(chapter).not.toContain('title: 发布文档')
    expect(nav).toContain('chapter.xhtml#heading-1')
  })

  it('导出 Excalidraw 时写入渲染后的 SVG，而不是场景 JSON', async () => {
    const html = convertForExport(excalidrawMarkdown, 'html')
    const txt = convertForExport(excalidrawMarkdown, 'txt')
    const rtf = buildRtf(excalidrawMarkdown)
    const docx = await JSZip.loadAsync(await buildDocx(excalidrawMarkdown))
    const epub = await JSZip.loadAsync(await buildEpub(excalidrawMarkdown))
    const documentXml = await docx.file('word/document.xml')?.async('string')
    const svgPart = await docx.file('word/media/excalidraw-1.svg')?.async('string')
    const chapter = await epub.file('OEBPS/chapter.xhtml')?.async('string')

    expect(html).toContain('<svg')
    expect(html).toContain('excalidraw-preview-svg')
    expect(html).not.toContain('"type":"rectangle"')
    expect(chapter).toContain('<svg')
    expect(chapter).not.toContain('"type":"rectangle"')
    expect(svgPart).toContain('<svg')
    expect(svgPart).toContain('<rect')
    expect(documentXml).toContain('rIdSvg1')
    expect(documentXml).not.toContain('"type":"rectangle"')
    expect(rtf).not.toContain('"type":"rectangle"')
    expect(txt).not.toContain('"type":"rectangle"')
    expect(txt).toContain('[Excalidraw]')
  })

  it('导出外部 Excalidraw 引用和 Mermaid 时写入渲染结果', async () => {
    const scene = JSON.stringify({
      type: 'excalidraw',
      version: 2,
      elements: [{ type: 'ellipse', x: 1, y: 2, width: 30, height: 20 }],
      appState: {},
      files: {},
    })
    const markdown = [
      '```excalidraw',
      './sketch.excalidraw',
      '```',
      '',
      '```mermaid',
      'flowchart LR',
      '  A-->B',
      '```',
    ].join('\n')
    const html = await renderExportHtml(markdown, 'D:/notes', async (path) => {
      expect(path.replace(/\\/g, '/')).toBe('D:/notes/sketch.excalidraw')
      return scene
    })
    expect(html).toContain('<ellipse')
    expect(html).not.toContain('./sketch.excalidraw')
    expect(html).toContain('class="mermaid-export"')
    expect(html).toContain('mermaid-test')
    expect(html).not.toContain('flowchart LR')
  })
})