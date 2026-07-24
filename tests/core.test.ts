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
import { markdownToHtml as builtinMarkdownToHtml } from '../src/utils/markdown/builtin'
import { markdownToHtml as thirdMarkdownToHtml } from '../src/utils/markdown/third'
import { clampPopupPosition } from '../src/utils/popupPosition'
import { THEME_OPTIONS, getAppliedTheme, isDarkTheme, normalizeTheme } from '../src/utils/themes'
import { DICTS } from '../src/i18n/locales'
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
    it('应注册全部导出格式', () => {
      expect(EXPORT_FORMATS).toEqual(['md', 'html', 'txt', 'pdf', 'docx', 'epub', 'rtf', 'opml'])
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

// 浮层边界定位：覆盖编辑器菜单与输入弹窗共用的位置计算。
describe('Floating popup positioning', () => {
  it('keeps a popup at its requested position when fully visible', () => {
    expect(clampPopupPosition(120, 80, 200, 100, 800, 600)).toEqual({ left: 120, top: 80 })
  })

  it('clamps a popup inside the right and bottom edges', () => {
    expect(clampPopupPosition(760, 580, 200, 100, 800, 600)).toEqual({ left: 592, top: 492 })
  })

  it('centers around the anchor and clamps the top-left corner', () => {
    expect(clampPopupPosition(10, -20, 320, 180, 800, 600, { centerX: true })).toEqual({ left: 8, top: 8 })
  })
})

describe('Network image rendering', () => {
  it('preserves HTTP and HTTPS image URLs in the built-in engine', () => {
    const html = builtinMarkdownToHtml('![secure](https://example.com/a.png)\n\n![plain](http://example.com/b.jpg)\n\n![caps](HTTPS://example.com/c.webp)')
    expect(html).toContain('src="https://example.com/a.png"')
    expect(html).toContain('src="http://example.com/b.jpg"')
    expect(html).toContain('src="HTTPS://example.com/c.webp"')
  })
})

describe('Theme palettes', () => {
  it('includes all requested editor palettes', () => {
    expect(THEME_OPTIONS.map((item) => item.id)).toEqual(expect.arrayContaining([
      'absolutely',
      'ayu',
      'catppuccin',
      'codex',
      'dracula',
      'everforest',
      'github',
      'gruvbox',
      'linear',
      'vercel',
      'vs-code-plus',
      'xcode',
    ]))
  })

  it('normalizes unknown persisted themes to system', () => {
    expect(normalizeTheme('not-a-theme')).toBe('system')
    expect(normalizeTheme('catppuccin')).toBe('catppuccin')
  })

  it('resolves system and custom dark themes', () => {
    expect(getAppliedTheme('system', true)).toBe('dark')
    expect(getAppliedTheme('system', false)).toBe('light')
    expect(isDarkTheme('dracula', false)).toBe(true)
    expect(isDarkTheme('github', true)).toBe(false)
  })
})

describe('Tab context menu i18n', () => {
  it('contains reveal-in-file-manager labels in every locale', () => {
    const keys = ['tab.revealInFileManager', 'tab.revealFailed']

    for (const dict of Object.values(DICTS)) {
      for (const key of keys) {
        expect(dict[key]).toBeTruthy()
        expect(dict[key]).not.toBe(key)
      }
    }
  })
})

describe('New document templates', () => {
  it('use real line breaks and render as Markdown in every locale', () => {
    const keys = [
      'document.defaultContent',
      'emptyState.template.diary.content',
      'emptyState.template.meeting.content',
      'emptyState.template.todo.content',
      'emptyState.template.tech.content',
      'emptyState.template.reading.content',
    ]

    for (const dict of Object.values(DICTS)) {
      for (const key of keys) {
        const template = dict[key]
        expect(template).not.toContain(String.raw`\n`)
        expect(template).toContain(String.fromCharCode(10))
        expect(builtinMarkdownToHtml(template)).toContain('<h1')
        expect(thirdMarkdownToHtml(template)).toContain('<h1')
      }
    }
  })
})

describe('Settings i18n', () => {
  it('contains window close behavior labels in every locale', () => {
    const keys = [
      'window.closeAction.title',
      'window.closeAction.label',
      'window.closeAction.hint',
      'window.closeAction.ask',
      'window.closeAction.minimize',
      'window.closeAction.close',
      'window.closeAction.skipPromptActive',
      'window.closeAction.resetPrompt',
      'window.closePrompt.title',
      'window.closePrompt.message',
      'window.closePrompt.dontAskAgain',
      'window.closePrompt.minimize',
      'window.closePrompt.close',
    ]

    for (const dict of Object.values(DICTS)) {
      for (const key of keys) {
        expect(dict[key]).toBeTruthy()
        expect(dict[key]).not.toBe(key)
      }
    }
  })

  it('contains toolbar layout labels in every locale', () => {
    const keys = [
      'settings.toolbar',
      'settings.toolbarFloating',
      'settings.toolbarFloating.hint',
      'settings.toolbarPosition',
      'settings.toolbarPosition.hint',
      'settings.toolbarPosition.top',
      'settings.toolbarPosition.left',
      'settings.toolbarPosition.bottom',
      'settings.toolbarPosition.right',
      'settings.toolbarCustomize',
      'settings.toolbarCustomize.hint',
      'settings.toolbarCustomize.reset',
      'settings.toolbarVisible',
      'settings.toolbarVisible.hint',
      'settings.toolbarHidden',
      'settings.toolbarHidden.hint',
      'settings.toolbarDivider',
      'settings.toolbarDropEmpty',
      'settings.toolbarButton.hint',
      'settings.toolbarPlacement.toolbar',
      'settings.toolbarPlacement.hidden',
      'settings.toolbarPlacement.group',
      'settings.toolbarGroup.format',
      'settings.toolbarGroup.block',
      'settings.toolbarGroup.insert',
      'settings.toolbarGroup.utility',
      'settings.toolbarSeparatorBefore',
    ]

    for (const dict of Object.values(DICTS)) {
      for (const key of keys) {
        expect(dict[key]).toBeTruthy()
        expect(dict[key]).not.toBe(key)
      }
    }
  })
})

describe('AI assistant i18n', () => {
  it('contains the labels used by the editor and settings UI', () => {
    const keys = [
      'settings.group.ai',
      'settings.nav.ai',
      'toolbar.ai',
      'ai.action.continue',
      'ai.action.summarize',
      'ai.action.polish',
      'ai.action.translate',
      'ai.menu.disabled',
      'ai.panel.loading',
      'ai.panel.insert',
      'ai.panel.replaceSelection',
      'ai.panel.replaceDocument',
      'ai.panel.close',
      'ai.error.emptyInput',
      'ai.error.notEnabled',
      'ai.settings.enable',
      'ai.settings.provider',
      'ai.settings.endpoint',
      'ai.settings.model',
      'ai.settings.apiKey',
      'ai.settings.targetLanguage',
      'ai.settings.temperature',
      'ai.settings.privacyHint',
      'palette.aiContinue',
      'palette.aiSummarize',
      'palette.aiPolish',
      'palette.aiTranslate',
    ]

    for (const dict of Object.values(DICTS)) {
      for (const key of keys) {
        expect(dict[key], key).toBeTruthy()
      }
    }
  })
})
