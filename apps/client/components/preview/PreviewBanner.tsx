import { Eye } from 'lucide-react'

interface PreviewBannerProps {
  /** 미리보는 템플릿 이름 */
  templateName?: string
  /** 지금 내용 중 이 템플릿에서 보이지 않는 섹션 수 (T-057-A) */
  hiddenCount?: number
}

/**
 * 미리보기 모드 상단 고정 배너 (T-057).
 * 실제 사이트가 아니라 미리보기임을 명확히 알린다.
 */
export function PreviewBanner({ templateName, hiddenCount = 0 }: PreviewBannerProps) {
  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex flex-col items-center justify-center gap-0.5 bg-slate-900 px-4 py-2 text-center text-sm font-medium text-white"
    >
      <span className="flex items-center gap-2">
        <Eye className="h-4 w-4 shrink-0" aria-hidden />
        <span>
          미리보기 모드
          {templateName ? ` · ${templateName}` : ''} — 실제 사이트에는 아직
          적용되지 않았습니다.
        </span>
      </span>
      {hiddenCount > 0 && (
        <span className="text-xs font-normal text-amber-300" data-testid="preview-hidden-notice">
          지금 내용 중 {hiddenCount}개 섹션은 이 템플릿에서 보이지 않습니다. (내용은 지워지지
          않으며, 다시 맞는 템플릿으로 바꾸면 그대로 보입니다)
        </span>
      )}
    </div>
  )
}
