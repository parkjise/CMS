import type { ComponentType } from 'react'
import { ContactForm } from './ContactForm'
import { GalleryForm } from './GalleryForm'
import { GenericForm } from './GenericForm'
import { HeroBannerForm } from './HeroBannerForm'
import { IntroForm } from './IntroForm'
import { MapForm } from './MapForm'
import { ServicesForm } from './ServicesForm'
import type { SectionFormProps } from './types'

export type SectionFormComponent = ComponentType<SectionFormProps>

export const SECTION_FORMS: Record<string, SectionFormComponent> = {
  HERO_BANNER: HeroBannerForm,
  INTRO: IntroForm,
  SERVICES: ServicesForm,
  GALLERY: GalleryForm,
  MAP: MapForm,
  CONTACT: ContactForm,
}

export function getFormForType(sectionType: string): SectionFormComponent {
  return SECTION_FORMS[sectionType] ?? GenericForm
}
