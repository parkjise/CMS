import type { PublicBoard } from '@cms/types'
import type { Metadata } from 'next'
import type { PublicSeoSettings, PublicSite } from './publicSite.types'

/** 검색 노출 설정 (T-129) — 'noindex,follow' 등. 값이 없으면 전체 허용 */
export function robotsFrom(seo: PublicSeoSettings | null | undefined): {
  index: boolean
  follow: boolean
} {
  const parts = (seo?.robots ?? 'index,follow').split(',')
  return { index: !parts.includes('noindex'), follow: !parts.includes('nofollow') }
}

/**
 * 페이지별 대표 주소 (T-129). 공통 레이아웃에 넣으면 서브 페이지까지 메인을 가리켜
 * 검색에서 빠지므로, 각 페이지 메타에서 경로를 붙여 쓴다.
 */
export function canonicalMeta(site: PublicSite, path = ''): Pick<Metadata, 'alternates'> {
  // 직접 정한 대표 주소가 먼저, 없으면 연결한 도메인 — 메인 주소와 중복 수집 방지 (T-137)
  const custom = site.tenant.custom_domain ? `https://${site.tenant.custom_domain}` : null
  const base = (site.seo_settings?.canonical_url ?? custom)?.replace(/\/+$/, '')
  return base ? { alternates: { canonical: `${base}${path}` } } : {}
}

/**
 * 새 게시판 화면 메타 (T-146). 검색 제목 · 설명은 목록 화면에만 — 글 화면은 글 제목.
 * 검색 노출을 끄면 글 화면까지 뺀다. 켜져 있으면 robots 키를 넣지 않아 레이아웃 설정(T-129)을 따른다.
 */
export function boardSeoMeta(
  board: PublicBoard,
  tenantName: string,
  postTitle?: string,
): Pick<Metadata, 'title' | 'description' | 'robots'> {
  return {
    title: `${postTitle ?? (board.seo_title || board.name)} | ${tenantName}`,
    ...(!postTitle && board.seo_description ? { description: board.seo_description } : {}),
    // 회원만 읽는 게시판은 검색에 내지 않는다 (T-150)
    ...(board.seo_index === false || board.read_access === 'MEMBER'
      ? { robots: { index: false, follow: false } }
      : {}),
  }
}
