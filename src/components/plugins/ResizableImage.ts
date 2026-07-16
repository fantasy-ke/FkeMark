/**
 * 自定义 Image 扩展：支持 width / height 属性
 * - 像素值（如 300）渲染为 style="width:300px"
 * - 百分比值（如 50）渲染为 style="width:50%"
 * - 无值时渲染为 max-width:100%（响应式默认）
 */
import Image from '@tiptap/extension-image'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    resizableImage: {
      /** 更新当前选中图片的尺寸 */
      updateImageSize: (attrs: { width?: number | null; height?: number | null; widthUnit?: string; heightUnit?: string }) => ReturnType
    }
  }
}

export interface ResizableImageOptions {
  inline: boolean
  allowBase64: boolean
}

export const ResizableImage = Image.extend({
  name: 'image',

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => {
          const style = el.getAttribute('style') || ''
          const wMatch = style.match(/width:\s*(\d+(?:\.\d+)?)(px|%)/)
          if (wMatch) return parseFloat(wMatch[1])
          const w = el.getAttribute('width')
          return w ? parseInt(w, 10) : null
        },
        renderHTML: (attrs) => {
          if (!attrs.width) return {}
          return {}
        },
      },
      height: {
        default: null,
        parseHTML: (el) => {
          const style = el.getAttribute('style') || ''
          const hMatch = style.match(/height:\s*(\d+(?:\.\d+)?)(px|%)/)
          if (hMatch) return parseFloat(hMatch[1])
          const h = el.getAttribute('height')
          return h ? parseInt(h, 10) : null
        },
        renderHTML: (attrs) => {
          if (!attrs.height) return {}
          return {}
        },
      },
      widthUnit: {
        default: 'px',
        parseHTML: (el) => {
          const style = el.getAttribute('style') || ''
          const wMatch = style.match(/width:\s*\d+(?:\.\d+)?(px|%)/)
          return wMatch ? (wMatch[1] === '%' ? '%' : 'px') : 'px'
        },
        renderHTML: () => ({}),
      },
      heightUnit: {
        default: 'px',
        parseHTML: (el) => {
          const style = el.getAttribute('style') || ''
          const hMatch = style.match(/height:\s*\d+(?:\.\d+)?(px|%)/)
          return hMatch ? (hMatch[1] === '%' ? '%' : 'px') : 'px'
        },
        renderHTML: () => ({}),
      },
    }
  },

  renderHTML({ node, HTMLAttributes }) {
    const style: string[] = []
    const w = node.attrs.width as number | null
    const h = node.attrs.height as number | null
    const wu = (node.attrs.widthUnit as string) || 'px'
    const hu = (node.attrs.heightUnit as string) || 'px'

    if (w != null) {
      style.push(`width:${w}${wu}`)
    }
    if (h != null) {
      style.push(`height:${h}${hu}`)
    }

    return [
      'img',
      {
        ...HTMLAttributes,
        src: HTMLAttributes.src,
        alt: HTMLAttributes.alt || null,
        title: HTMLAttributes.title || null,
        style: style.length > 0 ? style.join(';') : undefined,
      },
    ]
  },

  addCommands() {
    return {
      updateImageSize:
        (attrs) =>
        ({ tr, state }) => {
          const { selection } = state
          const { from } = selection
          const node = state.doc.nodeAt(from)

          if (node && node.type.name === 'image') {
            const newAttrs = { ...node.attrs, ...attrs }
            tr.setNodeMarkup(from, undefined, newAttrs)
            return true
          }

          // 图片可能被 Mark 包裹，检查 from - 1
          if (from > 0) {
            const prevNode = state.doc.nodeAt(from - 1)
            if (prevNode && prevNode.type.name === 'image') {
              const newAttrs = { ...prevNode.attrs, ...attrs }
              tr.setNodeMarkup(from - 1, undefined, newAttrs)
              return true
            }
          }

          return false
        },
    }
  },
})
