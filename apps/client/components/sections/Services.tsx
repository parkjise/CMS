import { getJson, getString } from '@/lib/sectionSettings'
import type { SectionProps, ServicesItem } from './types'

export function Services({ section }: SectionProps) {
  const title = getString(section.settings, 'section_title')
  const items = getJson<ServicesItem[]>(section.settings, 'services_list', [])

  return (
    <section
      data-section-id={section.id}
      data-section-type="SERVICES"
      className="bg-slate-50 px-6 py-16 md:py-24"
    >
      <div className="mx-auto max-w-6xl">
        {title && (
          <h2
            data-editable
            data-field="section_title"
            data-section-id={section.id}
            className="text-2xl font-bold text-slate-900 md:text-3xl"
          >
            {title}
          </h2>
        )}

        {items.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">
            서비스 정보가 준비 중입니다.
          </p>
        ) : (
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {items.map((item, idx) => (
              <div
                key={`${item.name}-${idx}`}
                className="rounded-lg border border-slate-200 bg-white p-6 transition hover:shadow-md"
              >
                <h3 className="text-lg font-semibold text-slate-900">
                  {item.name || '서비스명'}
                </h3>
                <p className="mt-2 whitespace-pre-line text-sm text-slate-600">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
