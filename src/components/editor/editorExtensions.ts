import OrderedList from '@tiptap/extension-ordered-list'
import BulletList from '@tiptap/extension-bullet-list'
import CodeBlock, { type CodeBlockOptions } from '@tiptap/extension-code-block'
import Table from '@tiptap/extension-table'
import {
  createIncrementalLowlightPlugin,
  type IncrementalLowlight,
} from './incrementalLowlight'

interface MarkdownCodeBlockOptions extends CodeBlockOptions {
  lowlight: IncrementalLowlight
}

// 有序列表扩展：增加 listStyle 属性（渲染为 data-ls），支持工具栏切换编号样式
export const StyledOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      listStyle: {
        default: 'decimal',
        parseHTML: (el) => (el.getAttribute('data-ls') as string) || 'decimal',
        renderHTML: (attrs) =>
          attrs.listStyle && attrs.listStyle !== 'decimal'
            ? { 'data-ls': attrs.listStyle }
            : {},
      },
    }
  },
})

// 无序列表扩展：增加 marker 属性（渲染为 data-marker），保留原始列表标记（* / - / +）
// 解决 MD→HTML→TipTap→HTML→MD 往返转换时 * 被统一为 - 的问题
export const CustomBulletList = BulletList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      marker: {
        default: '-',
        parseHTML: (el) => (el.getAttribute('data-marker') as string) || '-',
        renderHTML: (attrs) =>
          attrs.marker && attrs.marker !== '-'
            ? { 'data-marker': attrs.marker }
            : {},
      },
    }
  },
})

// 表格扩展：增加 separators 属性（渲染为 data-separators），保留原始分隔行格式
// 解决 MD→HTML→TipTap→HTML→MD 往返转换时 | --------- | 被缩短为 | --- | 的问题
export const CustomTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      separators: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-separators'),
        renderHTML: (attrs) =>
          attrs.separators ? { 'data-separators': attrs.separators } : {},
      },
    }
  },
})

// 代码块扩展：增量更新当前 transaction 涉及的高亮，并保留 Front Matter 标记。
export const MarkdownCodeBlock = CodeBlock.extend<MarkdownCodeBlockOptions>({
  addOptions() {
    return {
      ...this.parent?.(),
      lowlight: {} as IncrementalLowlight,
      languageClassPrefix: 'language-',
      exitOnTripleEnter: true,
      exitOnArrowDown: true,
      defaultLanguage: null,
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      frontmatter: {
        default: false,
        parseHTML: (el) => el.hasAttribute('data-frontmatter'),
        renderHTML: (attrs) => attrs.frontmatter ? { 'data-frontmatter': 'true' } : {},
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      createIncrementalLowlightPlugin({
        name: this.name,
        lowlight: this.options.lowlight,
        defaultLanguage: this.options.defaultLanguage,
      }),
    ]
  },
})

/** 对外暴露的命令式接口，供 App 调用（如拖拽图片插入） */
