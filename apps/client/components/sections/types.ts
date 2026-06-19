import type { PublicSection } from '@/lib/publicSite.types'

export interface SectionProps {
  section: PublicSection
  tenantSlug: string
}

export interface ServicesItem {
  name: string
  description: string
}

export interface GalleryItem {
  image_url: string
  caption: string
}
