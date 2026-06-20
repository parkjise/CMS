import Image from 'next/image'
import { getJson, getString } from '@/lib/sectionSettings'
import type { GalleryItem, SectionProps } from './types'

export function Gallery({ section }: SectionProps) {
  const title = getString(section.settings, 'section_title')
  const items = getJson<GalleryItem[]>(section.settings, 'gallery_items', [])

  return (
    <section
      data-section-id={section.id}
      data-section-type="GALLERY"
      className="bg-[var(--color-background)] px-6 py-16 md:py-24"
    >
      <div className="mx-auto max-w-6xl">
        {title && (
          <h2
            data-editable
            data-field="section_title"
            data-section-id={section.id}
            className="text-2xl font-bold text-[color:var(--color-text-primary)] md:text-3xl"
          >
            {title}
          </h2>
        )}

        {items.length === 0 ? (
          <p className="mt-6 text-sm text-[color:var(--color-text-muted)]">
            등록된 이미지가 없습니다.
          </p>
        ) : (
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
            {items.map((item, idx) => (
              <figure
                key={`${item.image_url}-${idx}`}
                className="overflow-hidden rounded-[var(--border-radius-card)]"
              >
                <div className="relative aspect-square w-full overflow-hidden">
                  <Image
                    src={item.image_url}
                    alt={item.caption || `gallery-${idx}`}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    className="object-cover transition hover:scale-105"
                  />
                </div>
                {item.caption && (
                  <figcaption className="mt-2 text-xs text-[color:var(--color-text-muted)]">
                    {item.caption}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
