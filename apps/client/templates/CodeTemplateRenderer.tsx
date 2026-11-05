import type { PublicBoard } from '@cms/types'
import { buildCssVarBody } from '@/lib/theme'
import { NOTICE_BOARD, fetchPublicPosts } from '@/lib/publicPosts'
import type { PublicSite } from '@/lib/publicSite.types'
import type { CodeTemplateEntry, MemberRoute } from './shared/contracts'
import { resolvePageSections, resolveSiteInfo } from './shared/resolveSections'

const LATEST_NOTICE_COUNT = 4

interface Props {
  entry: CodeTemplateEntry
  site: PublicSite
  tenantSlug: string
  onCustomDomain?: boolean
  pageKey: string
  preview?: boolean
  /**
   * 'tenant'(기본): 테넌트 콘텐츠 + 빈 값만 샘플 / 'sample': 템플릿 샘플 그대로 (디자인 원본 확인용 미리보기)
   */
  contentSource?: 'tenant' | 'sample'
  /** 미리보기 안에서 페이지 이동 링크를 유지하기 위한 쿼리 ('tpl=…&content=…') */
  previewQuery?: string
  detailId?: string
  query?: { q?: string; p?: string }
  member?: MemberRoute
  /** 지금 페이지가 새 게시판이면 그 게시판 (T-140-B) */
  board?: PublicBoard
}

/**
 * 코드형 템플릿 렌더링 (서버 컴포넌트).
 * - 페이지 루트에 data-template 을 달아 템플릿 스타일 범위를 제한한다 (기획서 11.7 스타일 격리)
 * - 실제 적용 중인 템플릿이면 테넌트 CSS 변수(색상 커스터마이징)를 템플릿 루트에 덮어쓴다.
 *   미리보기에서는 템플릿 기본 토큰을 그대로 보여준다.
 */
export async function CodeTemplateRenderer({
  entry,
  site,
  tenantSlug,
  onCustomDomain,
  pageKey,
  preview = false,
  contentSource = 'tenant',
  previewQuery,
  detailId,
  query,
  member,
  board,
}: Props) {
  const { default: Template } = await entry.load()
  const useSample = contentSource === 'sample'
  const sections = resolvePageSections(
    entry.manifest,
    entry.sample,
    useSample ? [] : site.sections,
    pageKey,
  )
  const siteInfo = useSample ? { ...entry.sample.site } : resolveSiteInfo(entry.sample, site)
  // 메인 최신 공지 — 샘플 미리보기가 아닌 실제 섹션일 때만 실제 글을 읽는다 (T-139)
  const latestNotices = sections.some(
    (s) => s.section.section_type === 'NOTICE_LATEST' && s.editable,
  )
    ? await fetchPublicPosts(tenantSlug, NOTICE_BOARD, { size: LATEST_NOTICE_COUNT, order: 'latest' })
    : null
  const overrideBody = preview ? '' : buildCssVarBody(site.template?.css_variables)

  return (
    <div data-template={entry.manifest.key} data-template-version={entry.manifest.version}>
      {overrideBody && (
        <style
          dangerouslySetInnerHTML={{
            __html: `[data-template='${entry.manifest.key}'] { ${overrideBody} }`,
          }}
        />
      )}
      <Template
        site={site}
        tenantSlug={tenantSlug}
        onCustomDomain={onCustomDomain}
        pageKey={pageKey}
        sections={sections}
        siteInfo={siteInfo}
        preview={preview}
        menuItems={useSample ? null : site.site_settings?.menu_items}
        boards={useSample ? [] : site.boards}
        board={board}
        previewQuery={previewQuery}
        latestNotices={latestNotices}
        detailId={detailId}
        query={query}
        member={member}
      />
    </div>
  )
}
