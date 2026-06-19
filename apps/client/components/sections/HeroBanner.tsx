import { getString } from '@/lib/sectionSettings'
import type { SectionProps } from './types'

export function HeroBanner({ section }: SectionProps) {
  const mainTitle = getString(section.settings, 'main_title')
  const subCopy = getString(section.settings, 'sub_copy')
  const bgImage = getString(section.settings, 'bg_image_url')
  const ctaText = getString(section.settings, 'cta_text')
  const ctaUrl = getString(section.settings, 'cta_url')

  return (
    <section
      data-section-id={section.id}
      data-section-type="HERO_BANNER"
      className="relative flex min-h-[60vh] items-center justify-center bg-slate-900 px-6 py-24 text-center md:min-h-[80vh]"
      style={
        bgImage
          ? {
              backgroundImage: `linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.4)), url(${bgImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : undefined
      }
    >
      <div className="max-w-3xl">
        {mainTitle && (
          <h1
            data-editable
            data-field="main_title"
            data-section-id={section.id}
            className="text-3xl font-bold leading-tight text-white md:text-5xl"
          >
            {mainTitle}
          </h1>
        )}
        {subCopy && (
          <p
            data-editable
            data-field="sub_copy"
            data-section-id={section.id}
            className="mt-4 text-base text-white/90 md:text-lg"
          >
            {subCopy}
          </p>
        )}
        {ctaText && ctaUrl && (
          <a
            data-editable
            data-field="cta_text"
            data-section-id={section.id}
            href={ctaUrl}
            className="mt-8 inline-flex items-center rounded-md bg-white px-6 py-3 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
          >
            {ctaText}
          </a>
        )}
      </div>
    </section>
  )
}
