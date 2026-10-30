// 아이콘 — 쓰는 아이콘만 담은 축소본 (pnpm icons:subset 으로 생성, T-125)
import './styles/remixicon-subset.css'
import './styles/index.scss'


import { Fragment, type ReactNode } from 'react'
import DeferredStylesheets from '../shared/DeferredStylesheets'
import { getJson, getString } from '@/lib/sectionSettings'
import {
  pageHref,
  type CodeSectionProps,
  type CodeTemplateProps,
} from '../shared/contracts'
import { hospitalAManifest } from './manifest'
import { Footer } from './components/Footer'
import { Header, type HeaderLink } from './components/Header'
import { QuickMenu, type QuickLink } from './components/QuickMenu'
import { ScrollReveal } from './components/ScrollReveal'
import { BrandIntro } from './components/sections/BrandIntro'
import { HeroSlider } from './components/sections/HeroSlider'
import { NoticeLatest } from './components/sections/NoticeLatest'
import { ServiceCards } from './components/sections/ServiceCards'
import { VideoPlaylist } from './components/sections/VideoPlaylist'
import { AreaRows } from './components/sub/AreaRows'
import { BannerSplit } from './components/sub/BannerSplit'
import { ConsultLinks } from './components/sub/ConsultLinks'
import { CriteriaCards } from './components/sub/CriteriaCards'
import { HistoryTimeline } from './components/sub/HistoryTimeline'
import { Location } from './components/sub/Location'
import { MediaRow } from './components/sub/MediaRow'
import { MilestoneSplit } from './components/sub/MilestoneSplit'
import { PageIntro } from './components/sub/PageIntro'
import { PhotoGallery } from './components/sub/PhotoGallery'
import { SplitStory } from './components/sub/SplitStory'
import { StrengthList } from './components/sub/StrengthList'
import { SubHero } from './components/sub/SubHero'
import { SubNav, type SubNavTab } from './components/sub/SubNav'
import { ValueCircles } from './components/sub/ValueCircles'
import { ConsultBoard } from './components/board/ConsultBoard'
import { NoticeBoard } from './components/board/NoticeBoard'
import { ReserveForm } from './components/board/ReserveForm'
import type { SearchTarget } from './components/board/BoardToolbar'
import { memberEnabled } from '@/lib/publicSite.types'
import type { PublicSection } from '@/lib/publicSite.types'
import { MEMBER_PAGES } from '../memberPages'
import { MemberScreen } from './components/member/MemberScreen'
import { MobileHideMarker } from '@/components/MobileHideMarker'
import { isMobileHidden } from '@/lib/mobileSettings'
import { applyMenu } from '@/lib/menuSettings'

// 웹폰트 (목업 _base.scss 의 @import)
// - Noto Serif KR: Google Fonts CSS (한글 글리프를 unicode-range 로 나눠 받음 — next/font 는 한글 서브셋이 없어 사용 안 함)
// - the-seasons: Typekit 키트 (도메인 등록 필요, 미등록 도메인은 대체 글꼴). 키트 설정에서
//   font-display 가 auto 라 적용할 때 swap 으로 바꾼다 (키트 설정에서 swap 으로 바꾸면 불필요)
// - 두 CSS 모두 첫 화면을 막지 않게 늦게 적용 (DeferredStylesheets, T-125)
// - 목업의 Cormorant Garamond 는 실제로 쓰는 곳이 없어 불러오지 않는다
const TYPEKIT_URL = 'https://use.typekit.net/ley8ols.css'
const FONT_URLS = [
  'https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;500&display=swap',
  TYPEKIT_URL,
]
// 키트가 font-display:auto 라 첫 화면 영문 카피(LCP)가 글꼴을 기다리며 숨는다 → swap 으로 적용
const SWAP_FONT_DISPLAY = [TYPEKIT_URL]

/** 회원 화면 상단 — 이미지 없는 서브 히어로 (목업 sub-hero-plain: eyebrow · category "Member") */
const memberHero = (title: string): PublicSection => ({
  id: 'member-hero',
  section_type: 'SUB_HERO',
  label: title,
  display_order: 0,
  is_active: true,
  page_key: 'member',
  settings: [
    { field_key: 'eyebrow', field_value: 'Member', value_type: 'STRING' },
    { field_key: 'title', field_value: title, value_type: 'STRING' },
    { field_key: 'category', field_value: 'Member', value_type: 'STRING' },
    { field_key: 'plain', field_value: 'true', value_type: 'BOOLEAN' },
  ],
})

const IMG_BASE = `/templates/${hospitalAManifest.key}/${hospitalAManifest.version}`

/**
 * hospital-a 템플릿 루트 — 목업 _template.html · 서브 페이지 구성 (header · main · footer · quick-menu)
 * 섹션 순서는 매니페스트 페이지 정의를 따른다 (resolvePageSections)
 */
export default function HospitalATemplate({
  site,
  tenantSlug,
  pageKey,
  sections,
  siteInfo,
  previewQuery,
  detailId,
  query,
  member,
  menuItems,
}: CodeTemplateProps) {
  const hrefFor = (key: string) => pageHref(tenantSlug, key, previewQuery)
  // 게시판 페이지 주소 (상세 id · 검색 q · 페이지 p) — 미리보기면 미리보기 주소 유지
  const boardHref = (extra?: { id?: string; q?: string; p?: number }) =>
    pageHref(tenantSlug, pageKey, previewQuery, extra)
  const searchTarget: SearchTarget = previewQuery
    ? {
        action: `/${tenantSlug}/preview`,
        hidden: [...new URLSearchParams(previewQuery).entries(), ['page', pageKey]],
      }
    : { action: `/${tenantSlug}/${pageKey}`, hidden: [] }
  const listPage = Math.max(1, Number(query?.p) || 1)
  const pages = hospitalAManifest.pages
  // 관리자 상단 메뉴 설정 — 이름 · 보이기 · 순서 (T-036-B)
  const menu: HeaderLink[] = applyMenu(
    pages.filter((p) => p.menu === 'gnb').map((p) => ({ key: p.key, label: p.title })),
    menuItems,
    true,
  ).map((p) => ({ href: hrefFor(p.key), title: p.label }))
  // 방문자 회원 화면 — 기획서 16.0 (/{slug}/member/*, T-113)
  const account: HeaderLink[] = [
    { href: `/${tenantSlug}/member/login`, title: '로그인' },
    { href: `/${tenantSlug}/member/join`, title: '회원가입' },
  ]
  const kakaoUrl = siteInfo.kakao_url || undefined
  const quickLinks: QuickLink[] = [
    { href: hrefFor('about'), label: '브랜드 소개', icon: 'ri-home-heart-line' },
    { href: hrefFor('about-history'), label: '연혁', icon: 'ri-history-line' },
    { href: '#contact', label: '운영 시간', icon: 'ri-time-line' },
    { href: hrefFor('about-location'), label: '오시는 길', icon: 'ri-map-pin-line' },
    ...(kakaoUrl
      ? [{ href: kakaoUrl, label: '카카오톡 상담', icon: 'ri-kakao-talk-line', external: true }]
      : []),
  ]

  // 하위 탭: 같은 묶음(parent)의 페이지가 둘 이상일 때만
  const page = pages.find((p) => p.key === pageKey)
  const group = page?.parent ?? page?.key
  const tabs: SubNavTab[] = pages
    .filter((p) => p.key === group || p.parent === group)
    .map((p) => ({ key: p.key, href: hrefFor(p.key), title: p.tab_title ?? p.title }))

  const renderBlock = (props: CodeSectionProps): ReactNode => {
    switch (getString(props.section.settings, 'layout')) {
      case 'page-intro':
        return <PageIntro {...props} />
      case 'media-row':
        return <MediaRow {...props} />
      case 'strength-list':
        return <StrengthList {...props} />
      case 'area-rows':
        return <AreaRows {...props} />
      case 'photo-gallery':
        return <PhotoGallery {...props} />
      case 'consult-links':
        return (
          <ConsultLinks {...props} consultHref={hrefFor('consult')} kakaoUrl={kakaoUrl} phone={siteInfo.phone} />
        )
      case 'split-story':
        return <SplitStory {...props} />
      case 'split-story-reverse':
        return <SplitStory {...props} reverse />
      case 'milestone-split':
        return <MilestoneSplit {...props} />
      case 'banner-split':
        return <BannerSplit {...props} />
      case 'criteria-cards':
        return <CriteriaCards {...props} />
      case 'value-circles':
        return <ValueCircles {...props} hrefFor={hrefFor} />
      default:
        return null
    }
  }

  const renderBoard = (props: CodeSectionProps): ReactNode => {
    switch (getString(props.section.settings, 'board')) {
      case 'notice':
        return (
          <NoticeBoard
            {...props}
            detailId={detailId}
            q={query?.q}
            page={listPage}
            hrefFor={boardHref}
            searchTarget={searchTarget}
          />
        )
      case 'consult':
        return (
          <ConsultBoard
            {...props}
            brandName={siteInfo.brand_name}
            detailId={detailId}
            q={query?.q}
            page={listPage}
            hrefFor={boardHref}
            searchTarget={searchTarget}
          />
        )
      case 'reservation':
        return (
          <ReserveForm
            tenantSlug={tenantSlug}
            times={getJson<string[]>(props.section.settings, 'times', [])}
          />
        )
      default:
        return null
    }
  }

  const renderSection = (props: CodeSectionProps): ReactNode => {
    switch (props.section.section_type) {
      case 'HERO_SLIDER':
        return <HeroSlider {...props} />
      case 'INTRO':
        return <BrandIntro {...props} />
      case 'SERVICES':
        return <ServiceCards {...props} />
      case 'VIDEO_PLAYLIST':
        return <VideoPlaylist {...props} />
      case 'NOTICE_LATEST':
        return (
          <NoticeLatest
            {...props}
            listHref={hrefFor('notice')}
            itemHref={(id) => pageHref(tenantSlug, 'notice', previewQuery, { id })}
          />
        )
      case 'SUB_HERO':
        return (
          <>
            <SubHero {...props} homeHref={hrefFor('home')} scrollIconUrl={`${IMG_BASE}/scroll-down.svg`} />
            {tabs.length > 1 && <SubNav tabs={tabs} current={pageKey} />}
          </>
        )
      case 'CONTENT_BLOCK':
        return renderBlock(props)
      case 'HISTORY_TIMELINE':
        return <HistoryTimeline {...props} />
      case 'MAP':
        return <Location {...props} />
      case 'BOARD':
        return renderBoard(props)
      default:
        return null
    }
  }

  return (
    <>
      {/* 웹폰트는 CSS → 폰트 파일 두 단계라 미리 연결해 둔다 */}
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://use.typekit.net" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://p.typekit.net" crossOrigin="anonymous" />
      {/* 웹폰트 CSS 는 첫 화면을 막지 않게 — 미리 받고 화면을 그린 뒤 적용 (T-125) */}
      <DeferredStylesheets hrefs={FONT_URLS} swapFontDisplay={SWAP_FONT_DISPLAY} />

      <Header
        brandName={siteInfo.brand_name}
        logoUrl={siteInfo.logo_url}
        homeHref={hrefFor('home')}
        menu={menu}
        account={account}
        tenantSlug={tenantSlug}
        memberEnabled={memberEnabled(site)}
      />

      <main className={`main${pageKey === 'home' ? '' : ' main--sub'}`} id="main" tabIndex={-1}>
        {/* 섹션을 감싸지 않는다 — 목업의 형제 선택자(.sub-nav + section 등)가 그대로 동작하도록 */}
        {member ? (
          // 방문자 회원 화면 (T-124) — 목업 sub-hero-plain + 회원 화면
          <>
            <SubHero
              section={memberHero(MEMBER_PAGES[member.page])}
              editable={false}
              tenantSlug={tenantSlug}
              homeHref={hrefFor('home')}
              scrollIconUrl={`${IMG_BASE}/scroll-down.svg`}
            />
            <MemberScreen slug={tenantSlug} brandName={siteInfo.brand_name} route={member} />
          </>
        ) : (
          sections.map(({ section, editable }) => (
            <Fragment key={section.id}>
              {/* 휴대폰에서 숨기기 (T-037-D) — 감싸지 않고 앞에 표식만 (globals.css) */}
              {isMobileHidden(section) && <MobileHideMarker />}
              {renderSection({ section, editable, tenantSlug })}
            </Fragment>
          ))
        )}
      </main>

      <Footer info={siteInfo} />
      <QuickMenu
        tenantSlug={tenantSlug}
        links={quickLinks}
        phone={siteInfo.phone}
        kakaoUrl={kakaoUrl}
        locationHref={hrefFor('about-location')}
      />
      <ScrollReveal templateKey={hospitalAManifest.key} />
    </>
  )
}
