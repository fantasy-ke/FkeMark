import OrderedList from '@tiptap/extension-ordered-list'
import BulletList from '@tiptap/extension-bullet-list'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Table from '@tiptap/extension-table'

// ── lowlight 实例已在 src/lib/lowlight.ts 中配置（注册了常用语言）──

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

// 代码块扩展：保留 Front Matter 标记，使 YAML 属性块编辑后仍能还原为 --- 包裹格式
export const MarkdownCodeBlock = CodeBlockLowlight.extend({
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
})

/** 对外暴露的命令式接口，供 App 调用（如拖拽图片插入） */
