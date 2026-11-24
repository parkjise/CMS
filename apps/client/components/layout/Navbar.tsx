'use client'

import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import type { PublicBoard, PublicMenuNode } from '@cms/types'
import type { PublicPage, PublicSection } from '@/lib/publicSite.types'
import MemberAccountLinks from '@/components/member/MemberAccountLinks'
import { isMobileHidden } from '@/lib/mobileSettings'
import { applyMenu, type MenuOverride } from '@/lib/menuSettings'
import { linkTarget, menuLinks, mobileLinks, type MenuLink } from '@/lib/menuTree'
import { boardPageKey } from '@/lib/publicPosts'
import { onCustomHost } from '@/lib/siteHost'

interface NavbarProps {
  tenantName: string
  /** 관리자 공통 설정의 로고 — 있으면 상호 글자 대신 (T-036-A) */
  logoUrl?: string | null
  /** 관리자 상단 메뉴 설정 (T-036-B) — 트리를 저장하기 전 */
  menuItems?: MenuOverride[] | null
  /** 메뉴 트리 (T-223) — 있으면 menuItems 대신 이것만, 하위 메뉴는 드롭다운 */
  menuTree?: PublicMenuNode[] | null
  sections: PublicSection[]
  /** 있으면 우측에 방문자 계정 메뉴 (로그인 · 회원가입 / 마이페이지 · 로그아웃, T-113) */
  tenantSlug?: string
  /** 실제 사이트 화면 — 새 게시판 메뉴 · 메인으로 돌아가는 링크 (T-141). 미리보기에는 없음 */
  site?: {
    slug: string
    boards?: PublicBoard[]
    /** 메인이 아닌 화면 — 섹션이 없으므로 섹션 메뉴는 메인으로 이동 */
    subPage?: boolean
    /** 직접 만든 공개 페이지 (T-240) — 메뉴에서 /{slug}/{주소} 로 */
    pages?: PublicPage[]
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

export function Navbar({ tenantName, logoUrl, menuItems, menuTree, sections, tenantSlug, site }: NavbarProps) {
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

  const links: MenuLink[] = menuTree
    ? // 메뉴 트리 (T-223) — 서버가 숨긴 메뉴 · 갈 곳 없는 메뉴를 이미 뺐다
      menuLinks(menuTree, {
        page: (id) => {
          const section = sections.find((s) => s.id === id && s.is_active)
          if (section) return { href: sectionHref(id), sectionId: id, mobileHidden: isMobileHidden(section) }
          // 직접 만든 페이지 (T-240) — 섹션 id 가 아니라 페이지 주소
          return site?.pages?.some((p) => p.page_key === id) ? { href: `${base}/${id}` } : null
        },
        board: (slug) => `${base}/${boardPageKey(slug)}`,
      })
    : // 관리자 상단 메뉴 설정 — 이름 · 보이기 (순서는 섹션 순서를 따르고 새 게시판은 그 뒤에, T-036-B · T-141)
      applyMenu(
        [
          ...sections
            .filter((s) => s.is_active)
            .map((s) => ({
              key: s.id,
              label: s.label,
              href: sectionHref(s.id),
              sectionId: s.id,
              mobileHidden: isMobileHidden(s),
            })),
          // 직접 만든 페이지 (T-240) — 맨 위 · 메뉴 표시만, 하위 페이지는 메뉴 트리에서
          ...(site?.pages ?? [])
            .filter((p) => !p.parent_key && p.show_in_menu)
            .map((p) => ({
              key: p.page_key,
              label: p.title,
              href: `${base}/${p.page_key}` as string | undefined,
              sectionId: undefined as string | undefined,
              mobileHidden: false,
            })),
          ...(site?.boards ?? []).map((b) => ({
            key: `board:${b.id}`,
            label: b.name,
            href: `${base}/${boardPageKey(b.slug)}` as string | undefined,
            sectionId: undefined as string | undefined,
            mobileHidden: false,
          })),
        ],
        menuItems,
        false,
      ).map((item) => ({ ...item, newWindow: false, children: [] }))
  // 휴대폰 메뉴에는 휴대폰에서 숨긴 섹션을 넣지 않는다 — 눌러도 갈 곳이 없다 (T-037-D)
  const mobileNav = mobileLinks(links)
  const hasSubmenu = links.some((link) => link.children.length > 0)

  /** 메뉴 한 칸 — 주소 / 섹션으로 내려가기 / 묶음 제목 */
  const item = (link: MenuLink, className: string, mobile = false) => {
    if (link.href) {
      return (
        <a
          href={link.href}
          className={className}
          {...linkTarget(link)}
          onClick={mobile ? () => setMobileOpen(false) : undefined}
        >
          {link.label}
        </a>
      )
    }
    if (link.sectionId) {
      const id = link.sectionId
      return (
        <button type="button" onClick={() => handleNavClick(id)} className={className}>
          {link.label}
        </button>
      )
    }
    return mobile ? (
      <span className={`${className} font-medium text-[color:var(--color-text-primary)]`}>{link.label}</span>
    ) : (
      <button type="button" aria-haspopup="true" className={className}>
        {link.label}
      </button>
    )
  }

  const mobileList = (items: MenuLink[], depth: number) => (
    <ul className="flex flex-col">
      {items.map((link) => (
        <li key={link.key}>
          {item(link, `${mobileItemClass} ${depth === 1 ? 'pl-10' : depth >= 2 ? 'pl-14' : ''}`, true)}
          {link.children.length > 0 && mobileList(link.children, depth + 1)}
        </li>
      ))}
    </ul>
  )

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
          <ul
            className={`flex items-center gap-6 ${hasSubmenu ? 'flex-wrap' : 'overflow-x-auto'}`}
          >
            {links.map((link) => (
              <li key={link.key} className={link.children.length > 0 ? 'group relative' : undefined}>
                {item(link, desktopItemClass)}
                {link.children.length > 0 && (
                  // 하위 메뉴 (T-223) — 마우스를 올리거나 키보드로 들어가면 펼친다, 3단계는 들여쓰기
                  <ul className="invisible absolute left-0 top-full z-50 min-w-[11rem] rounded-[var(--border-radius-md,0.5rem)] border border-[color:var(--color-border)] bg-[var(--color-background)] py-2 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                    {link.children.map((child) => (
                      <li key={child.key}>
                        {item(child, `block w-full px-4 py-2 text-left ${desktopItemClass}`)}
                        {child.children.length > 0 && (
                          <ul>
                            {child.children.map((grand) => (
                              <li key={grand.key}>
                                {item(grand, `block w-full py-1.5 pl-8 pr-4 text-left ${desktopItemClass}`)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
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
          <div className="py-2">{mobileList(mobileNav, 0)}</div>
        </nav>
      )}
    </header>
  )
}
