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
      className="relative flex min-h-[60vh] items-center justify-center bg-[var(--color-primary)] px-6 py-24 text-center md:min-h-[80vh]"
      style={
        bgImage
          ? {
              backgroundImage: `linear-gradient(var(--color-overlay), var(--color-overlay)), url(${bgImage})`,
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
            className="text-3xl font-bold leading-tight text-[color:var(--color-on-primary)] md:text-5xl"
          >
            {mainTitle}
          </h1>
        )}
        {subCopy && (
          <p
            data-editable
            data-field="sub_copy"
            data-section-id={section.id}
            className="mt-4 text-base text-[color:var(--color-on-primary)]/90 md:text-lg"
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
            className="mt-8 inline-flex items-center rounded-[var(--border-radius-base)] bg-[var(--color-background)] px-6 py-3 text-sm font-medium text-[color:var(--color-text-primary)] transition hover:bg-[var(--color-surface-strong)]"
          >
            {ctaText}
          </a>
        )}
      </div>
    </section>
  )
}
