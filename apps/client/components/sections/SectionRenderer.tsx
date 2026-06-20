import { ContactForm } from './ContactForm'
import { Gallery } from './Gallery'
import { HeroBanner } from './HeroBanner'
import { Intro } from './Intro'
import { MapLoader } from './MapLoader'
import { Services } from './Services'
import type { SectionProps } from './types'

export function SectionRenderer({ section, tenantSlug }: SectionProps) {
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
