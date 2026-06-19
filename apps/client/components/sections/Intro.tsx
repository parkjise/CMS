import { getString } from '@/lib/sectionSettings'
import type { SectionProps } from './types'

export function Intro({ section }: SectionProps) {
  const introText = getString(section.settings, 'intro_text')
  const introImage = getString(section.settings, 'intro_image_url')

  return (
    <section
      data-section-id={section.id}
      data-section-type="INTRO"
      className="bg-[var(--color-background)] px-6 py-16 md:py-24"
    >
      <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-2 md:items-center">
        {introImage && (
          <img
            data-editable
            data-field="intro_image_url"
            data-section-id={section.id}
            src={introImage}
            alt={section.label}
            className="w-full rounded-[var(--border-radius-card)] object-cover"
          />
        )}
        {introText && (
          <p
            data-editable
            data-field="intro_text"
            data-section-id={section.id}
            className="whitespace-pre-line text-base leading-relaxed text-[color:var(--color-text-secondary)] md:text-lg"
          >
            {introText}
          </p>
        )}
      </div>
    </section>
  )
}
