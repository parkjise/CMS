'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import MemberAccountLinks from '@/components/member/MemberAccountLinks'

export interface HeaderLink {
  href: string
  title: string
}

interface Props {
  brandName: string
  logoUrl: string
  homeHref: string
  menu: HeaderLink[]
  account: HeaderLink[]
  /** 방문자 로그인 상태에 따라 계정 메뉴 전환 (T-113) */
  tenantSlug: string
  /** 회원 기능(SITE_MEMBER)이 꺼져 있으면 계정 메뉴 숨김 (T-115) */
  memberEnabled?: boolean
}

const COLLAPSED = 'header--collapsed'

/**
 * 헤더 — 목업 components/header.html + assets/js/header.js
 * - 스크롤 시 .header--scrolled
 * - 1024px 미만 메뉴 토글 (링크 클릭·Esc·넓은 화면 전환 시 닫힘)
 * - 넓은 화면에서도 메뉴가 한 줄에 안 들어가면 토글로 접는다 — 고객이 게시판을 메뉴에 더한다 (T-140-B)
 */
export function Header({
  brandName,
  logoUrl,
  homeHref,
  menu,
  account,
  tenantSlug,
  memberEnabled = true,
}: Props) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      document.querySelector<HTMLButtonElement>('.header__menu-toggle')?.focus()
    }
    const mq = window.matchMedia('(min-width: 1024px)')
    const onWide = (e: MediaQueryListEvent) => e.matches && setOpen(false)
    document.addEventListener('keydown', onKey)
    mq.addEventListener('change', onWide)
    return () => {
      document.removeEventListener('keydown', onKey)
      mq.removeEventListener('change', onWide)
    }
  }, [open])

  useLayoutEffect(() => {
    const header = headerRef.current
    const inner = innerRef.current
    if (!header || !inner) return
    // 펼친 상태로 재 보고 바로 되돌린다 — 그리기 전이라 깜빡이지 않는다
    const measure = () => {
      const wasCollapsed = header.classList.contains(COLLAPSED)
      header.classList.remove(COLLAPSED)
      const overflows = inner.scrollWidth > inner.clientWidth
      header.classList.toggle(COLLAPSED, wasCollapsed)
      setCollapsed(overflows)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(inner)
    // 웹폰트가 늦게 적용되면 글자 폭이 바뀐다
    void document.fonts?.ready.then(measure)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <a className="skip-link" href="#main">
        본문 바로가기
      </a>

      <header
        className={`header${scrolled ? ' header--scrolled' : ''}${collapsed ? ` ${COLLAPSED}` : ''}`}
        id="header"
        ref={headerRef}
      >
        <div className="header__inner" ref={innerRef}>
          <h1 className="header__logo">
            <a className="header__logo-link" href={homeHref} lang="en">
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- 목업 마크업 유지 (SVG 로고)
                <img className="header__logo-image" src={logoUrl} alt="" width={2496} height={1696} />
              )}
              <span className="header__brand" title={brandName}>
                {brandName}
              </span>
            </a>
          </h1>

          <nav
            className={`header__nav${open ? ' header__nav--open' : ''}`}
            id="header-nav"
            aria-label="주 메뉴"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('a')) setOpen(false)
            }}
          >
            <ul className="header__menu">
              {menu.map((item) => (
                <li className="header__menu-item" key={item.href}>
                  <a className="header__menu-link" href={item.href}>
                    {item.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <button
            className="header__menu-toggle"
            type="button"
            aria-label={open ? '전체 메뉴 닫기' : '전체 메뉴 열기'}
            aria-controls="header-nav"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <i className={open ? 'ri-close-line' : 'ri-menu-line'} aria-hidden="true" />
          </button>

          <ul className="header__account">
            {memberEnabled && (
            <MemberAccountLinks
              slug={tenantSlug}
              guestLinks={account}
              linkClassName="header__account-link"
              asListItems
            />
            )}
          </ul>
        </div>
      </header>
    </>
  )
}
