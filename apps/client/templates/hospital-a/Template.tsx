import 'remixicon/fonts/remixicon.css'
import './styles/index.scss'

import type { ReactNode } from 'react'
import type { SectionType } from '@cms/types'
import type { CodeSectionProps, CodeTemplateProps } from '../shared/contracts'
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

// 웹폰트 (목업 _base.scss 의 @import) — the-seasons 는 Typekit 키트(도메인 등록 필요, 미등록 도메인은 대체 글꼴)
const FONT_URLS = [
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300..700;1,300..700&display=swap',
  'https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;500&display=swap',
  'https://use.typekit.net/ley8ols.css',
]

const pageHref = (slug: string, key: string) => (key === 'home' ? `/${slug}` : `/${slug}/${key}`)

/**
 * hospital-a 템플릿 루트 — 목업 _template.html 구성 (header · main · footer · quick-menu)
 * 섹션 순서는 매니페스트 페이지 정의를 따른다 (resolvePageSections)
 */
export default function HospitalATemplate({ tenantSlug, sections, siteInfo }: CodeTemplateProps) {
  const menu: HeaderLink[] = hospitalAManifest.pages
    .filter((p) => p.menu === 'gnb')
    .map((p) => ({ href: pageHref(tenantSlug, p.key), title: p.title }))
  // 방문자 회원 화면 — 기획서 16.0 (/{slug}/member/*, T-113)
  const account: HeaderLink[] = [
    { href: `/${tenantSlug}/member/login`, title: '로그인' },
    { href: `/${tenantSlug}/member/join`, title: '회원가입' },
  ]
  const kakaoUrl = siteInfo.kakao_url && siteInfo.kakao_url !== '#' ? siteInfo.kakao_url : undefined
  const quickLinks: QuickLink[] = [
    { href: pageHref(tenantSlug, 'about'), label: '브랜드 소개', icon: 'ri-home-heart-line' },
    { href: pageHref(tenantSlug, 'about-history'), label: '연혁', icon: 'ri-history-line' },
    { href: '#contact', label: '운영 시간', icon: 'ri-time-line' },
    { href: pageHref(tenantSlug, 'about-location'), label: '오시는 길', icon: 'ri-map-pin-line' },
    ...(kakaoUrl
      ? [{ href: kakaoUrl, label: '카카오톡 상담', icon: 'ri-kakao-talk-line', external: true }]
      : []),
  ]

  const renderSection = (props: CodeSectionProps): ReactNode => {
    const byType: Partial<Record<SectionType, ReactNode>> = {
      HERO_SLIDER: <HeroSlider {...props} />,
      INTRO: <BrandIntro {...props} />,
      SERVICES: <ServiceCards {...props} />,
      VIDEO_PLAYLIST: <VideoPlaylist {...props} />,
      NOTICE_LATEST: <NoticeLatest {...props} listHref={pageHref(tenantSlug, 'notice')} />,
    }
    return byType[props.section.section_type as SectionType] ?? null
  }

  return (
    <>
      {FONT_URLS.map((href) => (
        <link key={href} rel="stylesheet" href={href} precedence="default" />
      ))}

      <Header
        brandName={siteInfo.brand_name}
        logoUrl={siteInfo.logo_url}
        homeHref={pageHref(tenantSlug, 'home')}
        menu={menu}
        account={account}
      />

      <main className="main" id="main" tabIndex={-1}>
        {sections.map(({ section, editable }) => (
          <div key={section.id} data-section-id={section.id} data-section-type={section.section_type} className="u-contents">
            {renderSection({ section, editable, tenantSlug })}
          </div>
        ))}
      </main>

      <Footer info={siteInfo} />
      <QuickMenu
        tenantSlug={tenantSlug}
        links={quickLinks}
        phone={siteInfo.phone}
        kakaoUrl={kakaoUrl}
        locationHref={pageHref(tenantSlug, 'about-location')}
      />
      <ScrollReveal templateKey={hospitalAManifest.key} />
    </>
  )
}
