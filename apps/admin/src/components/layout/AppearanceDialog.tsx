import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

/** Native dialog provides focus trapping, Escape dismissal, and focus restoration. */
export function AppearanceDialog({
  title,
  onClose,
  children,
  drawer = false,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  drawer?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={`admin-dialog ${drawer ? 'admin-dialog-drawer' : ''}`}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="flex h-full min-h-0 flex-col bg-white">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-5">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            className="admin-icon-button"
            aria-label={`${title} 닫기`}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-6">{children}</div>
      </div>
    </dialog>
  )
}
