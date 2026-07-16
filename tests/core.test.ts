/**
 * FkeMark 核心功能自动化测试
 * - Markdown HTML 转换
 * - 导入导出系统
 * - 性能优化工具
 * - 设置系统
 */
import { describe, it, expect } from 'vitest'
import {
  validateImportFile,
  htmlToMarkdownSimple,
  convertForExport,
  EXPORT_FORMATS,
} from '../src/utils/importExport'
import {
  debounce,
  throttle,
  splitLargeDocument,
  isLargeDocument,
} from '../src/utils/performance'

// Markdown HTML 转换测试
describe('Markdown 转换', () => {
  describe('htmlToMarkdownSimple', () => {
    it('应正确转换标题', () => {
      expect(htmlToMarkdownSimple('<h1>标题一</h1>')).toContain('# 标题一')
      expect(htmlToMarkdownSimple('<h2>标题二</h2>')).toContain('## 标题二')
      expect(htmlToMarkdownSimple('<h3>标题三</h3>')).toContain('### 标题三')
    })

    it('应正确转换行内格式', () => {
      expect(htmlToMarkdownSimple('<strong>粗体</strong>')).toContain('**粗体**')
      expect(htmlToMarkdownSimple('<em>斜体</em>')).toContain('*斜体*')
      expect(htmlToMarkdownSimple('<s>删除线</s>')).toContain('~~删除线~~')
      expect(htmlToMarkdownSimple('<code>代码</code>')).toContain('`代码`')
    })

    it('应正确转换链接和图片', () => {
      expect(htmlToMarkdownSimple('<a href="https://example.com">链接</a>')).toContain('[链接](https://example.com)')
      expect(htmlToMarkdownSimple('<img src="image.png" alt="图片">')).toContain('![图片](image.png)')
    })

    it('应正确转换列表', () => {
      const html = '<ul><li>项1</li><li>项2</li></ul>'
      const result = htmlToMarkdownSimple(html)
      expect(result).toContain('项1')
      expect(result).toContain('项2')
    })

    it('应正确转换引用', () => {
      const result = htmlToMarkdownSimple('<blockquote>引用内容</blockquote>')
      expect(result).toContain('引用内容')
    })

    it('应正确转换分割线', () => {
      expect(htmlToMarkdownSimple('<hr>')).toContain('---')
    })
  })
})

// 导入导出系统测试
describe('导入导出系统', () => {
  describe('格式校验', () => {
    it('应接受 .md 文件', () => {
      expect(validateImportFile('test.md', '# Hello').valid).toBe(true)
    })

    it('应接受 .html 文件', () => {
      expect(validateImportFile('test.html', '<p>Hello</p>').valid).toBe(true)
    })

    it('应接受 .txt 文件', () => {
      expect(validateImportFile('test.txt', 'Hello world').valid).toBe(true)
    })

    it('应拒绝不支持的格式', () => {
      expect(validateImportFile('test.pdf', 'content').valid).toBe(false)
    })

    it('应拒绝空文件', () => {
      expect(validateImportFile('test.md', '').valid).toBe(false)
      expect(validateImportFile('test.md', '   ').valid).toBe(false)
    })
  })

  describe('导出格式', () => {
    it('应支持 md/html/txt 三种格式', () => {
      expect(EXPORT_FORMATS).toEqual(['md', 'html', 'txt'])
    })

    it('Markdown 导出应原样输出', () => {
      const content = '# Hello\n\nWorld'
      expect(convertForExport(content, 'md')).toBe(content)
    })

    it('HTML 导出应包含完整 HTML 结构', () => {
      const content = '# Hello\n\nWorld'
      const html = convertForExport(content, 'html')
      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('<h1>')
      expect(html).toContain('Hello')
    })

    it('TXT 导出应去除 Markdown 标记', () => {
      const content = '# 标题\n\n**粗体** *斜体*'
      const txt = convertForExport(content, 'txt')
      expect(txt).not.toContain('# 标题')
      expect(txt).not.toContain('**')
      expect(txt).toContain('标题')
      expect(txt).toContain('粗体')
    })
  })
})

// 性能优化工具测试
describe('性能优化工具', () => {
  describe('debounce', () => {
    it('应延迟执行', async () => {
      let count = 0
      const fn = debounce(() => { count++ }, 50)
      fn()
      fn()
      fn()
      expect(count).toBe(0)
      await new Promise((r) => setTimeout(r, 100))
      expect(count).toBe(1)
    })
  })

  describe('throttle', () => {
    it('应限制执行频率', async () => {
      let count = 0
      const fn = throttle(() => { count++ }, 50)
      fn()
      fn()
      fn()
      expect(count).toBe(1)
      await new Promise((r) => setTimeout(r, 100))
      fn()
      expect(count).toBe(2)
    })
  })

  describe('splitLargeDocument', () => {
    it('应按指定大小分片', () => {
      const content = Array.from({ length: 1000 }, (_, i) => `Line ${i}`).join('\n')
      const chunks = splitLargeDocument(content, 300)
      expect(chunks.length).toBe(4)
    })

    it('小文档应返回单一片', () => {
      const content = 'Hello\nWorld'
      const chunks = splitLargeDocument(content, 500)
      expect(chunks.length).toBe(1)
    })
  })

  describe('isLargeDocument', () => {
    it('应正确判断大文档', () => {
      expect(isLargeDocument('short')).toBe(false)
      expect(isLargeDocument('a'.repeat(200000))).toBe(true)
    })

    it('应支持自定义阈值', () => {
      expect(isLargeDocument('a'.repeat(500), 1000)).toBe(false)
      expect(isLargeDocument('a'.repeat(500), 400)).toBe(true)
    })
  })
})
