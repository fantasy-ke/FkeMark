import { Extension } from '@tiptap/core'

/**
 * 保留脚注引用、定义列表和返回链接的 HTML 元数据。
 * TipTap 默认只保留节点自身属性，缺少这些字段会让保存结果退化为普通链接与列表。
 */
export const FootnoteMetadata = Extension.create({
  name: 'footnoteMetadata',
  addGlobalAttributes() {
    return [
      {
        types: ['link'],
        attributes: {
          footnoteRef: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-footnote-ref'),
            renderHTML: (attrs) => attrs.footnoteRef ? { 'data-footnote-ref': attrs.footnoteRef } : {},
          },
          footnoteIndex: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-footnote-index'),
            renderHTML: (attrs) => attrs.footnoteIndex ? { 'data-footnote-index': attrs.footnoteIndex } : {},
          },
          footnoteBackref: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-footnote-backref'),
            renderHTML: (attrs) => attrs.footnoteBackref ? { 'data-footnote-backref': attrs.footnoteBackref } : {},
          },
          id: {
            default: null,
            parseHTML: (el) => el.getAttribute('id'),
            renderHTML: (attrs) => attrs.id ? { id: attrs.id } : {},
          },
        },
      },
      {
        types: ['orderedList'],
        attributes: {
          footnotes: {
            default: false,
            parseHTML: (el) => el.hasAttribute('data-footnotes'),
            renderHTML: (attrs) => attrs.footnotes ? { 'data-footnotes': 'true' } : {},
          },
        },
      },
      {
        types: ['listItem'],
        attributes: {
          footnoteLabel: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-footnote-label'),
            renderHTML: (attrs) => attrs.footnoteLabel ? { 'data-footnote-label': attrs.footnoteLabel } : {},
          },
          id: {
            default: null,
            parseHTML: (el) => el.getAttribute('id'),
            renderHTML: (attrs) => attrs.id ? { id: attrs.id } : {},
          },
        },
      },
    ]
  },
})
