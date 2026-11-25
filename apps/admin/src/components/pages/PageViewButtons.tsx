import { ExternalLink, Eye } from 'lucide-react'
import { toast } from '@cms/ui'
import { useCanEdit } from '@/hooks/useCanEdit'
import { type Page, usePreviewPage } from '@/hooks/usePages'
import { pickErrorMessage } from '@/lib/errorMessages'
import { buildSectionDraftUrl, buildSitePageUrl } from '@/lib/previewUrl'
import { useAuthStore } from '@/stores/authStore'

interface PageViewButtonsProps {
  page: Page
  /** 목록 한 줄 — 아이콘만 */
  compact?: boolean
}

const TEXT_BUTTON =
  'inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'
const ICON_BUTTON = 'rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600'

/**
 * 페이지 미리보기 · 화면에서 편집 (T-244, 페이지 관리 기획서 PM-01 · PM-06).
 * 미리보기는 숨김 페이지도 10분 동안 관리자만 보는 주소로 연다 — 보기 전용은 서버가 막아 숨긴다.
 * 화면에서 편집은 공개 페이지만 — 홈페이지에서 로그인돼 있으면 편집 모드로 고친다.
 */
export function PageViewButtons({ page, compact = false }: PageViewButtonsProps) {
  const canEdit = useCanEdit()
  const tenantSlug = useAuthStore((s) => s.tenantSlug) ?? ''
  const preview = usePreviewPage()

  const openPreview = async () => {
    // 팝업 차단을 피하려고 누른 순간 탭을 먼저 연다 (섹션 [미리보기]와 같은 방식)
    const win = window.open('', '_blank')
    if (!win) {
      toast.error('새 탭이 차단되었습니다. 브라우저에서 팝업을 허용해주세요.')
      return
    }
    try {
      const { token, page_key } = await preview.mutateAsync(page.id)
      win.opener = null
      win.location.href = buildSectionDraftUrl(tenantSlug, token, page_key)
    } catch (error) {
      win.close()
      toast.error(pickErrorMessage(error, '미리보기를 열지 못했습니다.'))
    }
  }

  return (
    <>
      {canEdit && (
        <button
          type="button"
          onClick={openPreview}
          disabled={preview.isPending}
          className={compact ? ICON_BUTTON : TEXT_BUTTON}
          aria-label={compact ? `${page.title} 미리보기` : undefined}
          title={page.is_public ? undefined : '숨김 페이지도 미리보기에서는 보여요'}
        >
          <Eye className="h-4 w-4" aria-hidden />
          {!compact && '미리보기'}
        </button>
      )}
      {page.is_public && (
        <a
          href={buildSitePageUrl(tenantSlug, page.page_key)}
          target="_blank"
          rel="noopener noreferrer"
          className={compact ? ICON_BUTTON : TEXT_BUTTON}
          aria-label={compact ? `${page.title} 화면에서 편집` : undefined}
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
          {!compact && '화면에서 편집'}
        </a>
      )}
    </>
  )
}
