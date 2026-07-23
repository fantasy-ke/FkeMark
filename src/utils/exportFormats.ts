import type { Lang } from '../i18n'
import { extractDocumentMetadata, markdownToPreviewHtml } from './markdown/engine'
import { prepareMarkdownForRendering } from './markdown/normalize'

interface ExportDocument {
  title: string
  author: string
  body: HTMLElement
}

interface OutlineNode {
  text: string
  note: string[]
  children: OutlineNode[]
}

interface WordTextStyle {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  code?: boolean
}

const fixedZipDate = new Date('2000-01-01T00:00:00.000Z')

function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function escapeXmlAttribute(value: string): string {
  return escapeXml(value).replace(/\r?\n/g, '&#10;')
}

function metadataText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function readExportDocument(markdown: string, lang: Lang = 'zh-CN'): ExportDocument {
  const metadata = extractDocumentMetadata(markdown)
  const prepared = prepareMarkdownForRendering(markdown)
  const parsed = new DOMParser().parseFromString(markdownToPreviewHtml(prepared.body), 'text/html')
  const firstHeading = parsed.body.querySelector('h1, h2, h3, h4, h5, h6')?.textContent?.trim() || ''
  const title = metadataText(metadata.frontMatter.title) || firstHeading || (lang === 'zh-CN' ? '未命名文档' : 'Untitled Document')
  const author = metadataText(metadata.frontMatter.author)
  return { title, author, body: parsed.body }
}

function readableText(element: Element): string {
  const clone = element.cloneNode(true) as Element
  clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
  clone.querySelectorAll('li').forEach((item) => item.append('\n'))
  clone.querySelectorAll('th, td').forEach((cell) => cell.append('\t'))
  return (clone.textContent || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function rtfEscape(value: string): string {
  let result = ''
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    const char = value[index]
    if (char === '\\' || char === '{' || char === '}') {
      result += `\\${char}`
    } else if (char === '\n') {
      result += '\\line '
    } else if (code >= 0x20 && code <= 0x7e) {
      result += char
    } else if (code === 0x09) {
      result += '\\tab '
    } else {
      result += `\\u${code > 0x7fff ? code - 0x10000 : code}?`
    }
  }
  return result
}

function rtfInline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return rtfEscape(node.textContent || '')
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const element = node as HTMLElement
  const children = Array.from(element.childNodes).map(rtfInline).join('')
  switch (element.tagName.toLowerCase()) {
    case 'strong':
    case 'b': return `{\\b ${children}}`
    case 'em':
    case 'i': return `{\\i ${children}}`
    case 'u': return `{\\ul ${children}}`
    case 's':
    case 'del': return `{\\strike ${children}}`
    case 'code': return `{\\f1 ${children}}`
    case 'br': return '\\line '
    case 'a': {
      const href = element.getAttribute('href') || ''
      return href && href !== element.textContent ? `${children} (${rtfEscape(href)})` : children
    }
    case 'img': {
      const label = element.getAttribute('alt') || element.getAttribute('src') || 'image'
      return rtfEscape(`[${label}]`)
    }
    default: return children
  }
}

function rtfList(element: Element, ordered: boolean, depth = 0): string {
  let result = ''
  const items = Array.from(element.children).filter((child) => child.tagName.toLowerCase() === 'li')
  items.forEach((item, index) => {
    const inline = Array.from(item.childNodes)
      .filter((node) => node.nodeType !== Node.ELEMENT_NODE || !['ul', 'ol'].includes((node as Element).tagName.toLowerCase()))
      .map(rtfInline)
      .join('')
    const prefix = ordered ? `${index + 1}.` : '•'
    result += `\\pard\\li${720 + depth * 360}\\fi-360 ${rtfEscape(prefix)}\\tab ${inline}\\par\n`
    Array.from(item.children).forEach((child) => {
      const tag = child.tagName.toLowerCase()
      if (tag === 'ul' || tag === 'ol') result += rtfList(child, tag === 'ol', depth + 1)
    })
  })
  return result
}

function rtfBlock(element: Element): string {
  const tag = element.tagName.toLowerCase()
  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag[1])
    const size = Math.max(28, 48 - (level - 1) * 4)
    return `\\pard\\sb240\\sa120\\b\\fs${size} ${Array.from(element.childNodes).map(rtfInline).join('')}\\b0\\fs24\\par\n`
  }
  if (tag === 'p') return `\\pard\\sa120 ${Array.from(element.childNodes).map(rtfInline).join('')}\\par\n`
  if (tag === 'ul' || tag === 'ol') return rtfList(element, tag === 'ol')
  if (tag === 'blockquote') return `\\pard\\li720\\ri360\\i ${rtfEscape(readableText(element))}\\i0\\par\n`
  if (tag === 'pre') return readableText(element).split('\n').map((line) => `\\pard\\li360\\f1 ${rtfEscape(line)}\\f0\\par\n`).join('')
  if (tag === 'table') {
    return Array.from(element.querySelectorAll('tr')).map((row) => {
      const cells = Array.from(row.querySelectorAll(':scope > th, :scope > td')).map(readableText)
      return `\\pard ${cells.map(rtfEscape).join('\\tab ')}\\par\n`
    }).join('')
  }
  if (tag === 'hr') return '\\pard ────────────────────\\par\n'
  if (tag === 'img') return `\\pard ${rtfInline(element)}\\par\n`
  return Array.from(element.children).map(rtfBlock).join('')
}

export function buildRtf(markdown: string, lang: Lang = 'zh-CN'): string {
  const document = readExportDocument(markdown, lang)
  const body = Array.from(document.body.children).map(rtfBlock).join('')
  return `{\\rtf1\\ansi\\ansicpg65001\\deff0\n{\\fonttbl{\\f0 Segoe UI;}{\\f1 Consolas;}}\n{\\info{\\title ${rtfEscape(document.title)}}${document.author ? `{\\author ${rtfEscape(document.author)}}` : ''}}\n\\viewkind4\\uc1\\fs24\n${body}}`
}

function serializeOutline(node: OutlineNode): string {
  const note = node.note.join('\n\n').trim()
  const attributes = `text="${escapeXmlAttribute(node.text)}"${note ? ` _note="${escapeXmlAttribute(note)}"` : ''}`
  if (node.children.length === 0) return `<outline ${attributes}/>`
  return `<outline ${attributes}>${node.children.map(serializeOutline).join('')}</outline>`
}

export function buildOpml(markdown: string, lang: Lang = 'zh-CN'): string {
  const document = readExportDocument(markdown, lang)
  const roots: OutlineNode[] = []
  const stack: Array<{ level: number; node: OutlineNode }> = []
  let current: OutlineNode | null = null

  Array.from(document.body.children).forEach((element) => {
    const heading = element.tagName.match(/^H([1-6])$/)
    if (heading) {
      const level = Number(heading[1])
      const node: OutlineNode = { text: readableText(element), note: [], children: [] }
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop()
      if (stack.length) stack[stack.length - 1].node.children.push(node)
      else roots.push(node)
      stack.push({ level, node })
      current = node
      return
    }

    const text = readableText(element)
    if (!text) return
    if (!current) {
      current = { text: document.title, note: [], children: [] }
      roots.push(current)
      stack.push({ level: 1, node: current })
    }
    current.note.push(text)
  })

  if (roots.length === 0) roots.push({ text: document.title, note: [], children: [] })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0"><head><title>${escapeXml(document.title)}</title></head><body>${roots.map(serializeOutline).join('')}</body></opml>`
}

function wordRun(text: string, style: WordTextStyle = {}): string {
  if (!text) return ''
  const properties = [
    style.bold ? '<w:b/>' : '',
    style.italic ? '<w:i/>' : '',
    style.underline ? '<w:u w:val="single"/>' : '',
    style.strike ? '<w:strike/>' : '',
    style.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:shd w:fill="F3F4F6"/>' : '',
  ].join('')
  return `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`
}

function wordInline(node: Node, style: WordTextStyle = {}): string {
  if (node.nodeType === Node.TEXT_NODE) return wordRun(node.textContent || '', style)
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const element = node as HTMLElement
  const tag = element.tagName.toLowerCase()
  if (tag === 'br') return '<w:r><w:br/></w:r>'
  if (tag === 'img') {
    const label = element.getAttribute('alt') || element.getAttribute('src') || 'image'
    return wordRun(`[${label}]`, style)
  }
  const nextStyle = { ...style }
  if (tag === 'strong' || tag === 'b') nextStyle.bold = true
  if (tag === 'em' || tag === 'i') nextStyle.italic = true
  if (tag === 'u') nextStyle.underline = true
  if (tag === 's' || tag === 'del') nextStyle.strike = true
  if (tag === 'code') nextStyle.code = true
  let content = Array.from(element.childNodes).map((child) => wordInline(child, nextStyle)).join('')
  if (tag === 'a') {
    const href = element.getAttribute('href') || ''
    if (href && href !== element.textContent) content += wordRun(` (${href})`, style)
  }
  return content
}

function wordParagraph(element: Element, styleName?: string, prefix = ''): string {
  const properties = styleName ? `<w:pPr><w:pStyle w:val="${styleName}"/></w:pPr>` : ''
  const content = wordRun(prefix) + Array.from(element.childNodes).map((node) => wordInline(node)).join('')
  return `<w:p>${properties}${content || wordRun(' ')}</w:p>`
}

function wordList(element: Element, ordered: boolean, depth = 0): string {
  const items = Array.from(element.children).filter((child) => child.tagName.toLowerCase() === 'li')
  return items.map((item, index) => {
    const inlineNodes = Array.from(item.childNodes).filter((node) => (
      node.nodeType !== Node.ELEMENT_NODE || !['ul', 'ol'].includes((node as Element).tagName.toLowerCase())
    ))
    const prefix = `${ordered ? `${index + 1}.` : '•'} `
    const paragraph = `<w:p><w:pPr><w:ind w:left="${720 + depth * 360}" w:hanging="360"/></w:pPr>${wordRun(prefix)}${inlineNodes.map((node) => wordInline(node)).join('')}</w:p>`
    const nested = Array.from(item.children).map((child) => {
      const tag = child.tagName.toLowerCase()
      return tag === 'ul' || tag === 'ol' ? wordList(child, tag === 'ol', depth + 1) : ''
    }).join('')
    return paragraph + nested
  }).join('')
}

function wordTable(element: Element): string {
  const rows = Array.from(element.querySelectorAll('tr')).map((row) => {
    const cells = Array.from(row.querySelectorAll(':scope > th, :scope > td')).map((cell) => (
      `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>${wordParagraph(cell)}</w:tc>`
    )).join('')
    return `<w:tr>${cells}</w:tr>`
  }).join('')
  return `<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="B7B7B7"/><w:left w:val="single" w:sz="4" w:color="B7B7B7"/><w:bottom w:val="single" w:sz="4" w:color="B7B7B7"/><w:right w:val="single" w:sz="4" w:color="B7B7B7"/><w:insideH w:val="single" w:sz="4" w:color="D9D9D9"/><w:insideV w:val="single" w:sz="4" w:color="D9D9D9"/></w:tblBorders></w:tblPr>${rows}</w:tbl>`
}

function wordBlock(element: Element): string {
  const tag = element.tagName.toLowerCase()
  if (/^h[1-6]$/.test(tag)) return wordParagraph(element, `Heading${tag[1]}`)
  if (tag === 'p') return wordParagraph(element)
  if (tag === 'ul' || tag === 'ol') return wordList(element, tag === 'ol')
  if (tag === 'table') return wordTable(element)
  if (tag === 'blockquote') return `<w:p><w:pPr><w:ind w:left="720"/><w:pBdr><w:left w:val="single" w:sz="18" w:color="C96442"/></w:pBdr></w:pPr>${wordRun(readableText(element), { italic: true })}</w:p>`
  if (tag === 'pre') return readableText(element).split('\n').map((line) => `<w:p><w:pPr><w:pStyle w:val="CodeBlock"/></w:pPr>${wordRun(line || ' ', { code: true })}</w:p>`).join('')
  if (tag === 'hr') return `<w:p>${wordRun('────────────────────')}</w:p>`
  if (tag === 'img') return wordParagraph(element)
  return Array.from(element.children).map(wordBlock).join('')
}

function documentStylesXml(): string {
  const headings = [1, 2, 3, 4, 5, 6].map((level) => {
    const size = Math.max(24, 40 - (level - 1) * 4)
    return `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr></w:style>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:eastAsia="Microsoft YaHei"/><w:sz w:val="24"/></w:rPr></w:style>${headings}<w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360"/><w:shd w:fill="F3F4F6"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="20"/></w:rPr></w:style></w:styles>`
}

export async function buildDocx(markdown: string, lang: Lang = 'zh-CN'): Promise<Uint8Array> {
  const document = readExportDocument(markdown, lang)
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const body = Array.from(document.body.children).map(wordBlock).join('')
  const created = new Date().toISOString()

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`, { date: fixedZipDate })
  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`, { date: fixedZipDate })
  zip.folder('word')?.file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`, { date: fixedZipDate })
  zip.folder('word')?.file('styles.xml', documentStylesXml(), { date: fixedZipDate })
  zip.folder('word')?.folder('_rels')?.file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`, { date: fixedZipDate })
  zip.folder('docProps')?.file('core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(document.title)}</dc:title>${document.author ? `<dc:creator>${escapeXml(document.author)}</dc:creator>` : ''}<cp:lastModifiedBy>FkeMark</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified></cp:coreProperties>`, { date: fixedZipDate })
  zip.folder('docProps')?.file('app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>FkeMark</Application></Properties>`, { date: fixedZipDate })

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

const xhtmlVoidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])

function serializeXhtml(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeXml(node.textContent || '')
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const element = node as HTMLElement
  const tag = element.tagName.toLowerCase()
  if (tag === 'input' && element.getAttribute('type') === 'checkbox') return element.hasAttribute('checked') ? '☑' : '☐'
  const attributes = Array.from(element.attributes)
    .filter((attribute) => !['contenteditable', 'spellcheck'].includes(attribute.name))
    .map((attribute) => ` ${attribute.name}="${escapeXmlAttribute(attribute.value || attribute.name)}"`)
    .join('')
  if (xhtmlVoidTags.has(tag)) return `<${tag}${attributes}/>`
  return `<${tag}${attributes}>${Array.from(element.childNodes).map(serializeXhtml).join('')}</${tag}>`
}

function stableIdentifier(markdown: string): string {
  let hash = 2166136261
  for (let index = 0; index < markdown.length; index++) {
    hash ^= markdown.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `urn:fkemark:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export async function buildEpub(markdown: string, lang: Lang = 'zh-CN'): Promise<Uint8Array> {
  const document = readExportDocument(markdown, lang)
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const headings = Array.from(document.body.querySelectorAll('h1, h2, h3, h4, h5, h6'))
  headings.forEach((heading, index) => { heading.id = `heading-${index + 1}` })
  const chapterBody = Array.from(document.body.childNodes).map(serializeXhtml).join('')
  const navItems = headings.length
    ? headings.map((heading) => `<li><a href="chapter.xhtml#${heading.id}">${escapeXml(heading.textContent?.trim() || document.title)}</a></li>`).join('')
    : `<li><a href="chapter.xhtml">${escapeXml(document.title)}</a></li>`
  const identifier = stableIdentifier(markdown)
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE', date: fixedZipDate })
  zip.folder('META-INF')?.file('container.xml', `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`, { date: fixedZipDate })
  const oebps = zip.folder('OEBPS')
  oebps?.file('content.opf', `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${lang}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">${identifier}</dc:identifier><dc:title>${escapeXml(document.title)}</dc:title><dc:language>${lang}</dc:language>${document.author ? `<dc:creator>${escapeXml(document.author)}</dc:creator>` : ''}<meta property="dcterms:modified">${modified}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="style" href="styles.css" media-type="text/css"/></manifest><spine><itemref idref="chapter"/></spine></package>`, { date: fixedZipDate })
  oebps?.file('nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${lang}"><head><title>${escapeXml(document.title)}</title></head><body><nav xmlns:epub="http://www.idpf.org/2007/ops" epub:type="toc"><h1>${lang === 'zh-CN' ? '目录' : 'Contents'}</h1><ol>${navItems}</ol></nav></body></html>`, { date: fixedZipDate })
  oebps?.file('chapter.xhtml', `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${lang}"><head><title>${escapeXml(document.title)}</title><link rel="stylesheet" type="text/css" href="styles.css"/></head><body>${chapterBody}</body></html>`, { date: fixedZipDate })
  oebps?.file('styles.css', `body{font-family:serif;line-height:1.7;margin:5%;}h1,h2,h3,h4,h5,h6{line-height:1.3;margin-top:1.5em;}pre,code{font-family:monospace;}pre{white-space:pre-wrap;background:#f3f4f6;padding:1em;}blockquote{border-left:.2em solid #999;margin-left:0;padding-left:1em;color:#555;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #999;padding:.4em;}img{max-width:100%;height:auto;}`, { date: fixedZipDate })

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}