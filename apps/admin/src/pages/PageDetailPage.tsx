import { useRef } from 'react'
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { PageSections } from '@/components/content/PageSections'
import { PageSettingsForm } from '@/components/pages/PageSettingsForm'
import { PageViewButtons } from '@/components/pages/PageViewButtons'
import { HOME_PAGE, usePages } from '@/hooks/usePages'
import { pagePath } from '@/lib/pageKey'

type Tab = 'sections' | 'settings'

/** 페이지 편집 (T-238) — [섹션] 은 예전 콘텐츠 편집 화면, [설정] 은 이름 · 주소 · 공개 · SEO */
export function PageDetailPage() {
  const { pageKey = HOME_PAGE } = useParams<{ pageKey: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data, isLoading } = usePages()
  const { search } = useLocation()
  const page = data?.pages.find((p) => p.page_key === pageKey)
  // 설정에서 주소를 바꾸면 같은 페이지를 새 주소로 연다
  const lastId = useRef<string | undefined>(undefined)
  if (page) lastId.current = page.id
  const moved = !page ? data?.pages.find((p) => p.id === lastId.current) : undefined
  if (moved) return <Navigate to={`/admin/pages/${moved.page_key}${search}`} replace />
  // 설정은 페이지 직접 추가 기능이 켜진 사업체만 바꿀 수 있다 (서버도 막는다)
  const canSet = Boolean(data?.enabled && page)
  const tab: Tab = canSet && searchParams.get('tab') === 'settings' ? 'settings' : 'sections'

  if (!isLoading && data && !page) {
    return (
      <div className="space-y-4 p-6 md:p-8">
        <BackLink />
        <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-600">
          페이지를 찾을 수 없어요. 지웠거나 주소가 바뀌었을 수 있어요.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <BackLink />
        <div className="mt-2 flex flex-wrap items-baseline gap-2">
          <h1 className="text-2xl font-bold text-slate-900">
            {page?.title ?? (pageKey === HOME_PAGE ? '홈' : pageKey)}
          </h1>
          <span className="text-sm text-slate-500">{pagePath(pageKey)}</span>
          {page && !page.is_public && (
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">숨김</span>
          )}
          {page && (
            <div className="ml-auto flex gap-2">
              <PageViewButtons page={page} />
            </div>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          이 페이지에 보이는 섹션을 관리합니다. 드래그로 순서를 바꾸고 토글로 노출 여부를
          조정하세요.
        </p>
      </div>

      {canSet && (
        <div
          role="tablist"
          aria-label="페이지 편집"
          className="flex gap-1 border-b border-slate-200"
        >
          {(
            [
              ['sections', '섹션'],
              ['settings', '설정'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() =>
                setSearchParams(value === 'settings' ? { tab: 'settings' } : {}, { replace: true })
              }
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                tab === value
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === 'settings' && page && data ? (
        <PageSettingsForm page={page} pages={data.pages} />
      ) : (
        <PageSections pageKey={pageKey} />
      )}
    </div>
  )
}

function BackLink() {
  return (
    <Link
      to="/admin/pages"
      className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> 페이지 목록
    </Link>
  )
}
