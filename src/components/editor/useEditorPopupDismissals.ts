import { useEffect } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'

type StateSetter = Dispatch<SetStateAction<any>>

interface PopupDismissalOptions {
  containerRef: RefObject<HTMLDivElement | null>
  imageCtxMenu: any
  tableCtxMenu: any
  slashOpen: boolean
  tablePickerOpen: boolean
  olPickerOpen: boolean
  headingPickerOpen: boolean
  setImageCtxMenu: StateSetter
  setTableCtxMenu: StateSetter
  setSlashState: StateSetter
  setTablePicker: StateSetter
  setOlPicker: StateSetter
  setHeadingPickerOpen: StateSetter
}

export function useEditorPopupDismissals({
  containerRef,
  imageCtxMenu,
  tableCtxMenu,
  slashOpen,
  tablePickerOpen,
  olPickerOpen,
  headingPickerOpen,
  setImageCtxMenu,
  setTableCtxMenu,
  setSlashState,
  setTablePicker,
  setOlPicker,
  setHeadingPickerOpen,
}: PopupDismissalOptions) {
  // ── 菜单关闭事件监听 ──
  useEffect(() => {
    if (!imageCtxMenu) return
    const close = () => setImageCtxMenu(null)
    const area = containerRef.current
    area?.addEventListener('click', close)
    return () => area?.removeEventListener('click', close)
  }, [imageCtxMenu, containerRef, setImageCtxMenu])

  useEffect(() => {
    if (!tableCtxMenu) return
    const close = () => setTableCtxMenu(null)
    const area = containerRef.current
    area?.addEventListener('click', close)
    return () => { area?.removeEventListener('click', close) }
  }, [tableCtxMenu, containerRef, setTableCtxMenu])

  useEffect(() => {
    if (!slashOpen) return
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.slash-menu')) setSlashState((s: any) => ({ ...s, open: false }))
    }
    const area = containerRef.current
    area?.addEventListener('mousedown', close)
    return () => area?.removeEventListener('mousedown', close)
  }, [slashOpen, containerRef, setSlashState])

  useEffect(() => {
    if (!tablePickerOpen) return
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.table-grid-picker') && !target.closest('[data-table-btn]')) {
        setTablePicker((s: any) => ({ ...s, open: false }))
      }
    }
    const area = containerRef.current
    area?.addEventListener('mousedown', close)
    return () => area?.removeEventListener('mousedown', close)
  }, [tablePickerOpen, containerRef, setTablePicker])

  useEffect(() => {
    if (!olPickerOpen) return
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.ol-style-picker') && !target.closest('[data-ol-btn]')) {
        setOlPicker((s: any) => ({ ...s, open: false }))
      }
    }
    const area = containerRef.current
    area?.addEventListener('mousedown', close)
    return () => area?.removeEventListener('mousedown', close)
  }, [olPickerOpen, containerRef, setOlPicker])

  useEffect(() => {
    if (!headingPickerOpen) return
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.tb-heading-dropdown')) {
        setHeadingPickerOpen(false)
      }
    }
    const area = containerRef.current
    area?.addEventListener('mousedown', close)
    return () => area?.removeEventListener('mousedown', close)
  }, [headingPickerOpen, containerRef, setHeadingPickerOpen])
}
