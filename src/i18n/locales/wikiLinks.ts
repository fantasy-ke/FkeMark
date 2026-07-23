import type { Dict } from './types'

export const wikiLinksZhCN: Dict = {
  'wikiLink.notFound': '未找到笔记“{name}”',
  'wikiLink.picker.title': '选择引用文档',
  'wikiLink.picker.empty': '当前项目中没有可引用的其他 Markdown 文档。',
  'wikiLink.picker.noMatch': '没有匹配的文档',
  'wikiLink.picker.documents': '文档（{count}）',
  'toolbar.wikilink': '双向链接 - [[文档名]]',
  'slash.cmd.wikilink': '双向链接',
  'slash.desc.wikilink': '[[文档名]]',
  'backlinks.title': '反向链接',
  'backlinks.toggle': '打开反向链接面板',
  'backlinks.close': '关闭反向链接面板',
  'backlinks.refresh': '刷新反向链接',
  'backlinks.loading': '正在扫描笔记链接…',
  'backlinks.empty': '还没有其他笔记链接到当前笔记。',
  'backlinks.partial': '有 {count} 个文件无法读取，结果可能不完整。',
  'backlinks.line': '第 {line} 行',
}

export const wikiLinksEnUS: Dict = {
  'wikiLink.notFound': 'Note “{name}” was not found',
  'wikiLink.picker.title': 'Select a document',
  'wikiLink.picker.empty': 'There are no other Markdown documents to reference in this project.',
  'wikiLink.picker.noMatch': 'No matching documents',
  'wikiLink.picker.documents': 'Documents ({count})',
  'toolbar.wikilink': 'Wiki link - [[Document]]',
  'slash.cmd.wikilink': 'Wiki link',
  'slash.desc.wikilink': '[[Document]]',
  'backlinks.title': 'Backlinks',
  'backlinks.toggle': 'Open backlinks panel',
  'backlinks.close': 'Close backlinks panel',
  'backlinks.refresh': 'Refresh backlinks',
  'backlinks.loading': 'Scanning note links…',
  'backlinks.empty': 'No other notes link to this note yet.',
  'backlinks.partial': '{count} file(s) could not be read, so results may be incomplete.',
  'backlinks.line': 'Line {line}',
}