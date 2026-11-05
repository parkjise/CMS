'use client'

import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import type { PublicBoard } from '@cms/types'
import type { PublicSection } from '@/lib/publicSite.types'
import MemberAccountLinks from '@/components/member/MemberAccountLinks'
import { isMobileHidden } from '@/lib/mobileSettings'
import { applyMenu, type MenuOverride } from '@/lib/menuSettings'
import { boardPageKey } from '@/lib/publicPosts'
import { onCustomHost } from '@/lib/siteHost'

interface NavbarProps {
  tenantName: string
  /** 관리자 공통 설정의 로고 — 있으면 상호 글자 대신 (T-036-A) */
  logoUrl?: string | null
  /** 관리자 상단 메뉴 설정 (T-036-B) */
  menuItems?: MenuOverride[] | null
  sections: PublicSection[]
  /** 있으면 우측에 방문자 계정 메뉴 (로그인 · 회원가입 / 마이페이지 · 로그아웃, T-113) */
  tenantSlug?: string
  /** 실제 사이트 화면 — 새 게시판 메뉴 · 메인으로 돌아가는 링크 (T-141). 미리보기에는 없음 */
  site?: {
    slug: string
    boards?: PublicBoard[]
    /** 메인이 아닌 화면 — 섹션이 없으므로 섹션 메뉴는 메인으로 이동 */
    subPage?: boolean
  }
}

const SECTION_HASH = '#section-'

const logoClass = 'shrink-0 whitespace-nowrap text-lg font-bold text-[color:var(--color-text-primary)]'
const desktopItemClass =
  'whitespace-nowrap text-sm text-[color:var(--color-text-secondary)] transition hover:text-[color:var(--color-primary)]'
const mobileItemClass =
  'block w-full px-6 py-3 text-left text-sm text-[color:var(--color-text-secondary)] hover:bg-[var(--color-surface)]'

const accountLinkClass =
  'text-sm text-[color:var(--color-text-secondary)] transition hover:text-[color:var(--color-primary)]'

export function Navbar({ tenantName, logoUrl, menuItems, sections, tenantSlug, site }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  // 고객 도메인은 주소에 slug 가 없다. 서버는 어느 쪽인지 몰라 slug 를 달아 그리고, 눌러도 301 로 맞게 간다
  const [noSlug, setNoSlug] = useState(false)

  useEffect(() => setNoSlug(onCustomHost()), [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleNavClick = (sectionId: string) => {
    setMobileOpen(false)
    if (typeof document === 'undefined') return
    const el = document.querySelector(`[data-section-id="${sectionId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // 게시판 화면에서 섹션 메뉴로 왔으면 그 섹션으로 내려간다 (T-141)
  useEffect(() => {
    const { hash } = window.location
    if (!site || site.subPage || !hash.startsWith(SECTION_HASH)) return
    document
      .querySelector(`[data-section-id="${CSS.escape(hash.slice(SECTION_HASH.length))}"]`)
      ?.scrollIntoView({ block: 'start' })
  }, [site])

  const base = site && !noSlug ? `/${site.slug}` : ''
  const homeHref = base || '/'
  const sectionHref = (id: string) => (site?.subPage ? `${homeHref}${SECTION_HASH}${id}` : undefined)

  // 관리자 상단 메뉴 설정 — 이름 · 보이기 (순서는 섹션 순서를 따르고 새 게시판은 그 뒤에, T-036-B · T-141)
  const navItems = applyMenu(
    [
      ...sections
        .filter((s) => s.is_active)
        .map((s) => ({
          key: s.id,
          label: s.label,
          href: sectionHref(s.id),
          mobileHidden: isMobileHidden(s),
        })),
      ...(site?.boards ?? []).map((b) => ({
        key: `board:${b.id}`,
        label: b.name,
        href: `${base}/${boardPageKey(b.slug)}` as string | undefined,
        mobileHidden: false,
      })),
    ],
    menuItems,
    false,
  )
  // 휴대폰 메뉴에는 휴대폰에서 숨긴 섹션을 넣지 않는다 — 눌러도 갈 곳이 없다 (T-037-D)
  const mobileNavItems = navItems.filter((s) => !s.mobileHidden)

  const logo = logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- 테넌트가 올린 임의 크기 로고
    <img src={logoUrl} alt="" className="h-8 w-auto max-w-[180px] object-contain" />
  ) : (
    tenantName
  )

  return (
    <header
      className={[
        'sticky top-0 z-40 w-full transition-all',
        scrolled
          ? 'border-b border-[color:var(--color-border)] bg-[var(--color-background)]/95 shadow-sm backdrop-blur'
          : 'bg-transparent',
      ].join(' ')}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        {site?.subPage ? (
          <a href={homeHref} className={logoClass} aria-label={`${tenantName} 홈으로 이동`}>
            {logo}
          </a>
        ) : (
          <button
            type="button"
            onClick={() =>
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }
            className={logoClass}
            aria-label={`${tenantName} 홈으로 이동`}
          >
            {logo}
          </button>
        )}

        {/* 메뉴가 많아도 글자가 세로로 쌓이지 않게 — 줄바꿈 대신 가로 스크롤 (T-057-A) */}
        <nav className="ml-6 hidden min-w-0 md:block" aria-label="페이지 내 섹션">
          <ul className="flex items-center gap-6 overflow-x-auto">
            {navItems.map((s) => (
              <li key={s.key}>
                {s.href ? (
                  <a href={s.href} className={desktopItemClass}>
                    {s.label}
                  </a>
                ) : (
                  <button type="button" onClick={() => handleNavClick(s.key)} className={desktopItemClass}>
                    {s.label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </nav>

        {tenantSlug && (
          <div className="ml-auto mr-4 flex items-center gap-4 md:ml-6 md:mr-0 md:order-last">
            <MemberAccountLinks slug={tenantSlug} linkClassName={accountLinkClass} />
          </div>
        )}

        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="md:hidden"
          aria-label={mobileOpen ? '메뉴 닫기' : '메뉴 열기'}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? (
            <X className="h-6 w-6 text-[color:var(--color-text-secondary)]" />
          ) : (
            <Menu className="h-6 w-6 text-[color:var(--color-text-secondary)]" />
          )}
        </button>
      </div>

      {mobileOpen && (
        <nav
          className="border-t border-[color:var(--color-border)] bg-[var(--color-background)] md:hidden"
          aria-label="모바일 섹션 메뉴"
        >
          <ul className="flex flex-col py-2">
            {mobileNavItems.map((s) => (
              <li key={s.key}>
                {s.href ? (
                  <a href={s.href} className={mobileItemClass} onClick={() => setMobileOpen(false)}>
                    {s.label}
                  </a>
                ) : (
                  <button type="button" onClick={() => handleNavClick(s.key)} className={mobileItemClass}>
                    {s.label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  )
}
