/**
 * 테마형 게시판 화면 · 메타 (T-141) — /b/{게시판} 과 /notice (T-176) 가 같이 쓴다.
 * 없는 주소의 404 상태 코드는 미들웨어가 맡는다 — 여기는 스트리밍이라 상태를 못 바꾼다.
 */
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { ThemeBoardDetail, ThemeBoardList } from '@/components/board/ThemeBoard'
import { ThemeBoardMember } from '@/components/board/ThemeBoardMember'
import { ThemeBoardSecret } from '@/components/board/ThemeBoardSecret'
import { ThemeBoardWrite } from '@/components/board/ThemeBoardWrite'
import { FloatingButtons } from '@/components/layout/FloatingButtons'
import { Footer } from '@/components/layout/Footer'
import { Navbar } from '@/components/layout/Navbar'
import { boardScreen, isFormScreen, isMemberOnly, resolveBoardRoute } from '@/lib/boardRoute'
import { boardPageKey } from '@/lib/publicPosts'
import { fetchPublicSite } from '@/lib/publicSite'
import { memberEnabled } from '@/lib/publicSite.types'
import { boardSeoMeta, canonicalMeta } from '@/lib/seoMeta'
import { CUSTOM_HOST_HEADER } from '@/lib/siteHost'
import { themeHomeSections } from '@/lib/themeSections'
import { pageHref } from '@/templates/shared/contracts'
import { usesCodeTemplate } from '@/templates/manifests'
import { TemplateSwitching } from '@/templates/shared/TemplateSwitching'

export interface BoardSearch {
  q?: string
  p?: string
  c?: string
}

export const NOT_FOUND_META: Metadata = {
  title: '페이지를 찾을 수 없습니다',
  robots: { index: false, follow: false },
}

/** 테마형 게시판 메타 — /b/{게시판} · /notice (T-176) 공통 */
export async function themeBoardMetadata(tenant_slug: string, path: string[]): Promise<Metadata> {
  const site = await fetchPublicSite(tenant_slug)
  if (!site) return NOT_FOUND_META
  if (usesCodeTemplate(site)) return { robots: { index: false, follow: false } }
  const route = await resolveBoardRoute(site, tenant_slug, path)
  if (!route) return NOT_FOUND_META
  const key = boardPageKey(route.board.slug)
  return {
    ...boardSeoMeta(route.board, site.tenant.name, route.post?.title),
    ...canonicalMeta(site, route.detailId ? `/${key}/${route.detailId}` : `/${key}`),
    // 회원 글쓰기 · 고치기 화면은 검색에 내지 않는다 (T-150-B)
    ...(isFormScreen(route.detailId) ? { robots: { index: false, follow: false } } : {}),
  }
}

/** 테마형 게시판 화면 — /b/{게시판} · /notice (T-176) 공통 */
export async function renderThemeBoard(tenant_slug: string, path: string[], search: BoardSearch) {
  const site = await fetchPublicSite(tenant_slug)
  if (!site) notFound()
  // 방금 코드형으로 바꿨는데 미들웨어가 아직 테마형으로 기억하는 중 (T-037-F)
  if (usesCodeTemplate(site)) return <TemplateSwitching />
  const route = await resolveBoardRoute(site, tenant_slug, path)
  if (!route) notFound()

  const { q, p, c } = search
  const noSlug = Boolean((await headers()).get(CUSTOM_HOST_HEADER))
  const key = boardPageKey(route.board.slug)
  const screen = boardScreen(route.detailId)
  const hrefFor = (extra?: { id?: string; q?: string; p?: number; c?: string }) =>
    pageHref(tenant_slug, key, undefined, { ...extra, noSlug })

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)]">
      <Navbar
        tenantName={site.tenant.name}
        logoUrl={site.site_settings?.logo_url}
        menuItems={site.site_settings?.menu_items}
        sections={themeHomeSections(site.sections, site.boards)}
        tenantSlug={memberEnabled(site) ? site.tenant.slug : undefined}
        site={{ slug: tenant_slug, boards: site.boards, subPage: true }}
      />
      <main className="flex-1">
        {screen.kind === 'write' || screen.kind === 'edit' ? (
          <ThemeBoardWrite
            board={route.board}
            tenantSlug={tenant_slug}
            postId={screen.kind === 'edit' ? screen.postId : undefined}
            pageKey={key}
            noSlug={noSlug}
            memberEnabled={memberEnabled(site)}
          />
        ) : isMemberOnly(route.board) ? (
          // 회원만 읽는 게시판 — 서버는 글을 읽지 않는다 (T-150)
          <ThemeBoardMember
            board={route.board}
            tenantSlug={tenant_slug}
            query={{ detailId: route.detailId, page: Math.max(1, Number(p) || 1), q, c }}
            pageKey={key}
            noSlug={noSlug}
            memberEnabled={memberEnabled(site)}
          />
        ) : route.post?.locked ? (
          // 비밀글 — 서버는 제목만 받는다. 쓴 회원이면 브라우저가 다시 읽는다 (T-151-A)
          <ThemeBoardSecret
            board={route.board}
            tenantSlug={tenant_slug}
            post={route.post}
            pageKey={key}
            noSlug={noSlug}
          />
        ) : route.post ? (
          <ThemeBoardDetail
            board={route.board}
            post={route.post}
            hrefFor={hrefFor}
            tenantSlug={tenant_slug}
          />
        ) : (
          <ThemeBoardList
            board={route.board}
            tenantSlug={tenant_slug}
            q={q}
            c={c}
            page={Math.max(1, Number(p) || 1)}
            hrefFor={hrefFor}
            searchAction={hrefFor()}
          />
        )}
      </main>
      <Footer tenantName={site.tenant.name} sns={site.sns_settings} info={site.site_settings} />
      <FloatingButtons
        tenantSlug={tenant_slug}
        kakaoUrl={site.sns_settings?.kakao_url ?? null}
        showKakao={site.sns_settings?.show_floating ?? true}
        kakaoPosition={site.sns_settings?.floating_position ?? 'BOTTOM_RIGHT'}
      />
    </div>
  )
}
