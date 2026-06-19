import { Loader2 } from 'lucide-react'

export const PageFallback = () => {
  return (
    <div
      className="flex h-full min-h-[60vh] w-full items-center justify-center"
      role="status"
      aria-live="polite"
      aria-label="페이지 로딩 중"
    >
      <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
    </div>
  )
}
