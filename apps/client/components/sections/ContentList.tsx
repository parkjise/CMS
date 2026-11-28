import { ChevronDown } from 'lucide-react'
import type { PublicContentItem, PublicFieldValue } from '@cms/types'
import { EditableText } from '@/components/edit/EditableText'
import { contentOptions, fetchContentItems } from '@/lib/publicContents'
import { fieldValueHref, fieldValueText } from '@/lib/publicPosts'
import { getString, getValueType } from '@/lib/sectionSettings'
import { RichBody } from '@/templates/shared/RichBody'
import type { SectionProps } from './types'

/** 연혁의 연도 · 로고 줄의 링크 — 시작용 유형(연혁 · 고객사)이 만드는 칸 */
const YEAR_FIELD = 'year'
const MONTH_FIELD = 'month'
const LINK_FIELD = 'link'
const SPECIAL_FIELDS = new Set([YEAR_FIELD, MONTH_FIELD, LINK_FIELD])

const primary = 'text-[color:var(--color-text-primary)]'
const muted = 'text-[color:var(--color-text-muted)]'
const line = 'border-[color:var(--color-border)]'

/** 사진 칸은 줄 글에서 뺀다 — 카드는 대표 사진으로 그린다 */
const textFields = (item: PublicContentItem): PublicFieldValue[] =>
  item.fields.filter((f) => !SPECIAL_FIELDS.has(f.key) && f.field_type !== 'IMAGE')

const linkOf = (item: PublicContentItem): string | null => {
  const link = item.fields.find((f) => f.key === LINK_FIELD)
  return link ? fieldValueHref(link) : null
}

const FieldLine = ({ item }: { item: PublicContentItem }) => {
  const fields = textFields(item)
  if (!fields.length) return null
  return <p className={`mt-1 text-sm ${muted}`}>{fields.map(fieldValueText).join(' · ')}</p>
}

const whenOf = (item: PublicContentItem): string => {
  const year = item.fields.find((f) => f.key === YEAR_FIELD)
  const month = item.fields.find((f) => f.key === MONTH_FIELD)
  if (!year) return item.published_at ? item.published_at.slice(0, 4) : ''
  return month ? `${fieldValueText(year)}.${String(month.value).padStart(2, '0')}` : fieldValueText(year)
}

/**
 * 테마형 콘텐츠 연결 섹션 (T-258, 콘텐츠 관리 기획서 5장) — 고른 유형의 공개 콘텐츠를
 * 카드 · 목록 · FAQ · 연혁 · 로고 줄로. 칸 매핑: 제목 · 요약 · 대표 사진 + 유형 칸.
 * 유형이 없거나(스위치 꺼짐 포함) 콘텐츠가 없으면 그리지 않는다 — 빈 결과 문구가 있으면 그 문구만.
 */
export async function ContentList({ section, tenantSlug }: SectionProps) {
  const { typeId, mode, sort, category, tag, count, emptyText } = contentOptions(section)
  if (!typeId) return null
  const items = await fetchContentItems(tenantSlug, typeId, {
    limit: count,
    sort,
    category,
    tag,
    body: mode === 'FAQ',
  })
  if (!items || (!items.length && !emptyText)) return null
  const title = getString(section.settings, 'section_title')

  return (
    <section
      data-section-id={section.id}
      data-section-type="CONTENT_LIST"
      data-display={mode}
      className="bg-[var(--color-background)] px-6 py-16 md:py-24"
    >
      <div className={`mx-auto ${mode === 'CARD' || mode === 'LOGO' ? 'max-w-6xl' : 'max-w-4xl'}`}>
        {title && (
          <EditableText
            as="h2"
            sectionId={section.id}
            field="section_title"
            valueType={getValueType(section.settings, 'section_title')}
            formatting
            initialValue={title}
            maxLength={40}
            className={`text-2xl font-bold md:text-3xl ${primary}`}
          />
        )}

        {!items.length ? (
          <p className={`mt-8 text-center ${muted}`}>{emptyText}</p>
        ) : mode === 'CARD' ? (
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const href = linkOf(item)
              const inner = (
                <>
                  {item.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element -- 고객이 올린 사진
                    <img
                      src={item.thumbnail}
                      alt=""
                      loading="lazy"
                      className="aspect-[4/3] w-full object-cover"
                    />
                  )}
                  <div className="p-5">
                    <h3 className={`font-semibold ${primary}`}>{item.title}</h3>
                    <FieldLine item={item} />
                    {item.summary && (
                      <p className={`mt-2 line-clamp-3 text-sm leading-relaxed ${muted}`}>
                        {item.summary}
                      </p>
                    )}
                  </div>
                </>
              )
              const box = `block h-full overflow-hidden rounded-xl border ${line} bg-[var(--color-surface)]`
              return (
                <li key={item.id}>
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" className={`${box} hover:shadow-md`}>
                      {inner}
                    </a>
                  ) : (
                    <div className={box}>{inner}</div>
                  )}
                </li>
              )
            })}
          </ul>
        ) : mode === 'FAQ' ? (
          <div className={`mt-8 border-t ${line}`}>
            {items.map((item) => (
              <details key={item.id} className={`group border-b ${line}`}>
                <summary
                  className={`flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-medium ${primary} [&::-webkit-details-marker]:hidden`}
                >
                  {item.title}
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 transition group-open:rotate-180 ${muted}`}
                    aria-hidden
                  />
                </summary>
                <div className={`rich-body pb-6 leading-relaxed ${primary}`}>
                  {item.body && item.body.length > 0 ? (
                    <RichBody nodes={item.body} />
                  ) : (
                    <p>{item.summary}</p>
                  )}
                </div>
              </details>
            ))}
          </div>
        ) : mode === 'TIMELINE' ? (
          <ol className={`mt-8 space-y-8 border-l-2 pl-6 ${line}`}>
            {items.map((item) => (
              <li key={item.id} className="relative">
                <span
                  aria-hidden
                  className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full bg-[var(--color-primary)]"
                />
                <p className="text-sm font-semibold text-[color:var(--color-primary)]">{whenOf(item)}</p>
                <h3 className={`mt-1 font-semibold ${primary}`}>{item.title}</h3>
                <FieldLine item={item} />
                {item.summary && (
                  <p className={`mt-1 text-sm leading-relaxed ${muted}`}>{item.summary}</p>
                )}
              </li>
            ))}
          </ol>
        ) : mode === 'LOGO' ? (
          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
            {items.map((item) => {
              const href = linkOf(item)
              const mark = item.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element -- 고객이 올린 로고
                <img
                  src={item.thumbnail}
                  alt={item.title}
                  loading="lazy"
                  className="h-12 w-auto max-w-[160px] object-contain opacity-80 transition hover:opacity-100"
                />
              ) : (
                <span className={`text-lg font-semibold ${muted}`}>{item.title}</span>
              )
              return (
                <li key={item.id}>
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={item.title}>
                      {mark}
                    </a>
                  ) : (
                    mark
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <ul className={`mt-8 divide-y divide-[color:var(--color-border)] border-y ${line}`}>
            {items.map((item) => (
              <li key={item.id} className="py-4">
                <p className={`font-medium ${primary}`}>{item.title}</p>
                <FieldLine item={item} />
                {item.summary && <p className={`mt-1 text-sm ${muted}`}>{item.summary}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
