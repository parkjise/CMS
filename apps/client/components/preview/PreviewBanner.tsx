import { Eye } from 'lucide-react'

interface PreviewBannerProps {
  /** 미리보는 템플릿 이름 */
  templateName?: string
}

/**
 * 미리보기 모드 상단 고정 배너 (T-057).
 * 실제 사이트가 아니라 미리보기임을 명확히 알린다.
 */
export function PreviewBanner({ templateName }: PreviewBannerProps) {
  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-slate-900 px-4 py-2 text-center text-sm font-medium text-white"
    >
      <Eye className="h-4 w-4 shrink-0" aria-hidden />
      <span>
        미리보기 모드
        {templateName ? ` · ${templateName}` : ''} — 실제 사이트에는 아직
        적용되지 않았습니다.
      </span>
    </div>
  )
}
