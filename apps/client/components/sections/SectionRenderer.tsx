import type { PublicBoard } from '@cms/types'
import { SectionControls } from '@/components/edit/SectionControls'
import { BoardLatest } from './BoardLatest'
import { ContactForm } from './ContactForm'
import { Gallery } from './Gallery'
import { HeroBanner } from './HeroBanner'
import { Intro } from './Intro'
import { MapLoader } from './MapLoader'
import { Services } from './Services'
import type { SectionProps } from './types'
import { isThemeRenderable } from '@/lib/themeSections'
import { isMobileHidden } from '@/lib/mobileSettings'

interface SectionRendererProps extends SectionProps {
  /** 사이트의 운영 중인 게시판 — 최신 글 섹션이 고른 게시판을 찾는다 (T-185) */
  boards?: PublicBoard[] | null
}

function SectionInner({ section, tenantSlug, boards }: SectionRendererProps) {
  switch (section.section_type) {
    case 'HERO_BANNER':
      return <HeroBanner section={section} tenantSlug={tenantSlug} />
    case 'INTRO':
      return <Intro section={section} tenantSlug={tenantSlug} />
    case 'SERVICES':
      return <Services section={section} tenantSlug={tenantSlug} />
    case 'GALLERY':
      return <Gallery section={section} tenantSlug={tenantSlug} />
    case 'CONTACT':
      return <ContactForm section={section} tenantSlug={tenantSlug} />
    case 'MAP':
      return <MapLoader section={section} tenantSlug={tenantSlug} />
    case 'BOARD_LATEST':
      return <BoardLatest section={section} tenantSlug={tenantSlug} boards={boards} />
    default:
      // RESERVATION, PORTFOLIO, TEAM, FAQ는 추후 페이즈에서 구현
      return null
  }
}

export function SectionRenderer({ section, tenantSlug, boards }: SectionRendererProps) {
  // 미지원 섹션 타입(RESERVATION 등)은 wrapper 없이 통과
  if (!isThemeRenderable(section)) return null

  return (
    <div
      data-section-wrapper={section.id}
      data-display-order={section.display_order}
      // 휴대폰에서 숨기기 (T-037-D) — globals.css
      data-mobile-hidden={isMobileHidden(section) ? 'true' : undefined}
      className="section-wrapper"
    >
      <SectionControls
        sectionId={section.id}
        label={section.label}
        mobileHidden={isMobileHidden(section)}
      />
      <SectionInner section={section} tenantSlug={tenantSlug} boards={boards} />
    </div>
  )
}
