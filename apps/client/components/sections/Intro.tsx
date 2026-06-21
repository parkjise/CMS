import { EditableImage } from '@/components/edit/EditableImage'
import { EditableText } from '@/components/edit/EditableText'
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
          <EditableImage
            sectionId={section.id}
            field="intro_image_url"
            initialUrl={introImage}
            context="intro"
            alt={section.label}
            sizes="(max-width: 768px) 100vw, 50vw"
            containerClassName="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--border-radius-card)]"
            className="object-cover"
          />
        )}
        {introText && (
          <EditableText
            as="p"
            sectionId={section.id}
            field="intro_text"
            initialValue={introText}
            maxLength={500}
            multiline
            className="whitespace-pre-line text-base leading-relaxed text-[color:var(--color-text-secondary)] md:text-lg"
          />
        )}
      </div>
    </section>
  )
}
