/**
 * 图片上传占位节点（TipTap / ProseMirror）
 *
 * 拖拽 / 粘贴图片时先插入此占位节点，显示骨架 + 进度条；上传完成后
 * 渲染最终 <img>。节点为 atom，renderHTML 在 done 状态输出 <img>，
 * 使得 htmlToMarkdown 能正常序列化为 ![alt](src)。
 */
import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { useI18n } from '../../i18n'

export interface ImageUploadAttrs {
  id: string
  name: string
  progress: number
  status: 'uploading' | 'done' | 'error'
  src: string
  error: string
}

function ImageView({ node }: NodeViewProps) {
  const attrs = node.attrs as ImageUploadAttrs
  const { t } = useI18n()
  const { id, name, progress, status, src, error } = attrs

  const cancel = () => {
    window.dispatchEvent(new CustomEvent('fkemark:img-upload-action', { detail: { id, action: 'cancel' } }))
  }

  if (status === 'done' && src) {
    return (
      <NodeViewWrapper className="fk-img-upload done" data-upload-id={id}>
        <img src={src} alt={name} className="fk-img-final" draggable={false} />
      </NodeViewWrapper>
    )
  }

  if (status === 'error') {
    return (
      <NodeViewWrapper className="fk-img-upload error" data-upload-id={id}>
        <div className="fk-img-ph">
          <span className="fk-img-warn">⚠</span>
          <span className="fk-img-name">{name}</span>
          <span className="fk-img-errmsg">{error}</span>
          <button className="fk-img-cancel" onClick={cancel} aria-label={t('image.remove')}>×</button>
        </div>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper className="fk-img-upload uploading" data-upload-id={id}>
      <div className="fk-img-ph">
        <span className="fk-img-spinner" />
        <span className="fk-img-name">{name}</span>
        <span className="fk-img-pct">{Math.round(progress)}%</span>
        <div className="fk-img-bar">
          <div className="fk-img-bar-fill" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
        <button className="fk-img-cancel" onClick={cancel} aria-label={t('image.cancelUpload')}>×</button>
      </div>
    </NodeViewWrapper>
  )
}

export const ImageUpload = Node.create({
  name: 'imageUpload',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  isolating: true,

  addAttributes() {
    return {
      id: { default: '', parseHTML: (el) => (el as HTMLElement).getAttribute('data-upload-id') || '', renderHTML: (a) => (a.id ? { 'data-upload-id': a.id } : {}) },
      name: { default: '', parseHTML: (el) => (el as HTMLElement).getAttribute('data-name') || '', renderHTML: (a) => (a.name ? { 'data-name': a.name } : {}) },
      progress: { default: 0, parseHTML: (el) => Number((el as HTMLElement).getAttribute('data-progress') || '0'), renderHTML: (a) => ({ 'data-progress': String(a.progress) }) },
      status: { default: 'uploading', parseHTML: (el) => (el as HTMLElement).getAttribute('data-status') || 'uploading', renderHTML: (a) => ({ 'data-status': a.status }) },
      src: { default: '', parseHTML: (el) => (el as HTMLElement).getAttribute('data-src') || '', renderHTML: (a) => (a.src ? { 'data-src': a.src } : {}) },
      error: { default: '', parseHTML: (el) => (el as HTMLElement).getAttribute('data-error') || '', renderHTML: (a) => (a.error ? { 'data-error': a.error } : {}) },
    }
  },

  parseHTML() {
    return [{ tag: 'span.fk-img-upload' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const a = node.attrs as ImageUploadAttrs
    if (a.status === 'done' && a.src) {
      return ['img', mergeAttributes({ src: a.src, alt: a.name, class: 'fk-img-final' }, {})]
    }
    return [
      'span',
      mergeAttributes(HTMLAttributes, { class: 'fk-img-upload' }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView)
  },
})
