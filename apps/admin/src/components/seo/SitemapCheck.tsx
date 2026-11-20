import { useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { Button } from '@cms/ui'
import { useSitemapCheck } from '@/hooks/useSeo'

interface SitemapCheckProps {
  /** 관리자가 읽어 오는 주소 — 늘 기본 주소 (연결한 도메인은 그쪽 CORS 를 모른다) */
  fetchUrl: string
  /** 사이트맵 안 주소의 앞부분 — 경로만 보여 주려고 뗀다 */
  base: string
  /** 연결한 도메인 — 있으면 같은 내용이 그 주소로 나간다고 알린다 */
  customDomain?: string | null
}

const PATH_LIMIT = 200

/** 사이트맵 생성 결과 확인 (T-225, SM-04) — 홈페이지가 실제로 내보내는 목록 */
export const SitemapCheck = ({ fetchUrl, base, customDomain }: SitemapCheckProps) => {
  const [open, setOpen] = useState(false)
  const query = useSitemapCheck(fetchUrl, base, open)
  const summary = query.data

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm font-medium text-slate-700">사이트맵 생성 결과</p>
        <a
          href={fetchUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
        >
          새 창에서 열기
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={query.isFetching}
          onClick={() => (open ? void query.refetch() : setOpen(true))}
        >
          {open ? (
            <>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              다시 확인
            </>
          ) : (
            '생성 결과 확인'
          )}
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        공개 페이지 · 게시판 · 글만 들어가요. 메뉴에서 숨긴 곳, 회원만 읽는 게시판, 검색 노출을 끈
        게시판은 빠집니다.
        {customDomain &&
          ` 연결한 도메인에서는 같은 내용이 https://${customDomain}/sitemap.xml 로 나가요.`}
      </p>
      {query.isError && (
        <p className="text-sm text-rose-600" role="alert">
          사이트맵을 불러오지 못했습니다. 잠시 뒤 다시 확인해 주세요.
        </p>
      )}
      {summary && (
        <div className="space-y-2" role="status">
          <p className="text-sm text-slate-700">
            주소 {summary.paths.length}개 · 메인 · 페이지 · 게시판 {summary.pages}개 · 글{' '}
            {summary.posts}개
          </p>
          <details>
            <summary className="cursor-pointer text-xs font-medium text-slate-600">
              주소 목록 보기
            </summary>
            <ul className="mt-2 max-h-64 space-y-0.5 overflow-auto rounded bg-slate-50 p-3 font-mono text-xs text-slate-600">
              {summary.paths.slice(0, PATH_LIMIT).map((path) => (
                <li key={path} className="break-all">
                  {path}
                </li>
              ))}
            </ul>
            {summary.paths.length > PATH_LIMIT && (
              <p className="mt-1 text-xs text-slate-500">
                처음 {PATH_LIMIT}개만 보여요. 전체는 [새 창에서 열기]로 확인하세요.
              </p>
            )}
          </details>
        </div>
      )}
    </div>
  )
}
