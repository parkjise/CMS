import { SectionControls } from '@/components/edit/SectionControls'
import { ContactForm } from './ContactForm'
import { Gallery } from './Gallery'
import { HeroBanner } from './HeroBanner'
import { Intro } from './Intro'
import { MapLoader } from './MapLoader'
import { Services } from './Services'
import type { SectionProps } from './types'

function SectionInner({ section, tenantSlug }: SectionProps) {
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
    default:
      // RESERVATION, PORTFOLIO, TEAM, FAQ는 추후 페이즈에서 구현
      return null
  }
}

const SUPPORTED_TYPES = [
  'HERO_BANNER',
  'INTRO',
  'SERVICES',
  'GALLERY',
  'CONTACT',
  'MAP',
]

export function SectionRenderer({ section, tenantSlug }: SectionProps) {
  // 미지원 섹션 타입(RESERVATION 등)은 wrapper 없이 통과
  if (!SUPPORTED_TYPES.includes(section.section_type)) return null

  return (
    <div
      data-section-wrapper={section.id}
      data-display-order={section.display_order}
      className="section-wrapper"
    >
      <SectionControls sectionId={section.id} label={section.label} />
      <SectionInner section={section} tenantSlug={tenantSlug} />
    </div>
  )
}
