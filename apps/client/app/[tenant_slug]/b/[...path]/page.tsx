import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { ThemeBoardDetail, ThemeBoardList } from '@/components/board/ThemeBoard'
import { FloatingButtons } from '@/components/layout/FloatingButtons'
import { Footer } from '@/components/layout/Footer'
import { Navbar } from '@/components/layout/Navbar'
import { resolveBoardRoute } from '@/lib/boardRoute'
import { boardPageKey } from '@/lib/publicPosts'
import { fetchPublicSite } from '@/lib/publicSite'
import { memberEnabled } from '@/lib/publicSite.types'
import { boardSeoMeta, canonicalMeta } from '@/lib/seoMeta'
import { CUSTOM_HOST_HEADER } from '@/lib/siteHost'
import { themeHomeSections } from '@/lib/themeSections'
import { pageHref } from '@/templates/shared/contracts'
import { usesCodeTemplate } from '@/templates/manifests'
import { TemplateSwitching } from '@/templates/shared/TemplateSwitching'

interface Props {
  params: Promise<{ tenant_slug: string; path: string[] }>
  searchParams: Promise<{ q?: string; p?: string; c?: string }>
}

const NOT_FOUND_META: Metadata = { title: '페이지를 찾을 수 없습니다', robots: { index: false, follow: false } }

/**
 * 새 게시판 — 테마형 템플릿 (T-141). 코드형은 미들웨어가 템플릿 라우트로 보낸다.
 * 없는 주소의 404 상태 코드는 미들웨어가 맡는다 — 여기는 스트리밍이라 상태를 못 바꾼다.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant_slug, path } = await params
  const site = await fetchPublicSite(tenant_slug)
  if (!site) return NOT_FOUND_META
  if (usesCodeTemplate(site)) return { robots: { index: false, follow: false } }
  const route = await resolveBoardRoute(site, tenant_slug, path)
  if (!route) return NOT_FOUND_META
  const key = boardPageKey(route.board.slug)
  return {
    ...boardSeoMeta(route.board, site.tenant.name, route.post?.title),
    ...canonicalMeta(site, route.detailId ? `/${key}/${route.detailId}` : `/${key}`),
  }
}

export default async function ThemeBoardPage({ params, searchParams }: Props) {
  const { tenant_slug, path } = await params
  const site = await fetchPublicSite(tenant_slug)
  if (!site) notFound()
  // 방금 코드형으로 바꿨는데 미들웨어가 아직 테마형으로 기억하는 중 (T-037-F)
  if (usesCodeTemplate(site)) return <TemplateSwitching />
  const route = await resolveBoardRoute(site, tenant_slug, path)
  if (!route) notFound()

  const { q, p, c } = await searchParams
  const noSlug = Boolean((await headers()).get(CUSTOM_HOST_HEADER))
  const key = boardPageKey(route.board.slug)
  const hrefFor = (extra?: { id?: string; q?: string; p?: number; c?: string }) =>
    pageHref(tenant_slug, key, undefined, { ...extra, noSlug })

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)]">
      <Navbar
        tenantName={site.tenant.name}
        logoUrl={site.site_settings?.logo_url}
        menuItems={site.site_settings?.menu_items}
        sections={themeHomeSections(site.sections)}
        tenantSlug={memberEnabled(site) ? site.tenant.slug : undefined}
        site={{ slug: tenant_slug, boards: site.boards, subPage: true }}
      />
      <main className="flex-1">
        {route.post ? (
          <ThemeBoardDetail board={route.board} post={route.post} hrefFor={hrefFor} />
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
