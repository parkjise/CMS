'use client'

import { useIsMember, useMemberStore } from '@/lib/memberStore'

export interface AccountLink {
  href: string
  title: string
}

interface MemberAccountLinksProps {
  slug: string
  /** 비로그인 메뉴 (로그인 · 회원가입) — 템플릿마다 다를 수 있음 */
  guestLinks?: AccountLink[]
  linkClassName: string
  /** li 로 감쌀지 (목업 header__account 는 ul > li) */
  asListItems?: boolean
}

export const defaultGuestLinks = (slug: string): AccountLink[] => [
  { href: `/${slug}/member/login`, title: '로그인' },
  { href: `/${slug}/member/join`, title: '회원가입' },
]

/** 헤더 계정 메뉴 — 방문자 로그인 상태면 마이페이지 · 로그아웃 (기획서 16.0, T-113) */
const MemberAccountLinks = ({
  slug,
  guestLinks,
  linkClassName,
  asListItems = false,
}: MemberAccountLinksProps) => {
  const isMember = useIsMember(slug)
  const logout = useMemberStore((s) => s.logout)

  const handleLogout = async () => {
    await logout()
    // 화면 상태(편집 · 폼)를 모두 비우도록 새로 불러온다
    window.location.assign(`/${slug}`)
  }

  const items: React.ReactNode[] = isMember
    ? [
        <a key="mypage" className={linkClassName} href={`/${slug}/member/mypage`}>
          마이페이지
        </a>,
        <button key="logout" type="button" className={linkClassName} onClick={handleLogout}>
          로그아웃
        </button>,
      ]
    : (guestLinks ?? defaultGuestLinks(slug)).map((link) => (
        <a key={link.href} className={linkClassName} href={link.href}>
          {link.title}
        </a>
      ))

  if (!asListItems) return <>{items}</>
  return (
    <>
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </>
  )
}

export default MemberAccountLinks
