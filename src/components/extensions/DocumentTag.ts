import { Mark, mergeAttributes } from '@tiptap/core'

/** 保留正文 #tag 的语义属性，避免 TipTap 往返后退化为普通文本。 */
export const DocumentTag = Mark.create({
  name: 'documentTag',
  inclusive: false,

  addAttributes() {
    return {
      tag: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-doc-tag'),
        renderHTML: (attributes) => attributes.tag
          ? { 'data-doc-tag': attributes.tag }
          : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-doc-tag]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ class: 'md-tag' }, HTMLAttributes), 0]
  },
})