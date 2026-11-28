import type { PublicContentItem, PublicFieldValue } from '@cms/types'
import { ContentListNotice } from '@/components/sections/ContentListNotice'
import { contentOptions, fetchContentItems } from '@/lib/publicContents'
import { fieldValueHref, fieldValueText } from '@/lib/publicPosts'
import { getString } from '@/lib/sectionSettings'
import type { CodeSectionProps } from '../../../shared/contracts'
import { RichBody } from '../../../shared/RichBody'
import { TemplateText } from '../../../shared/TemplateText'
import { titleId } from './ids'

/** 연혁의 연도 · 월, 카드 · 로고의 링크 — 시작용 유형(연혁 · 고객사)이 만드는 칸 */
const YEAR_FIELD = 'year'
const MONTH_FIELD = 'month'
const LINK_FIELD = 'link'
const SPECIAL_FIELDS = new Set([YEAR_FIELD, MONTH_FIELD, LINK_FIELD])

interface Props extends CodeSectionProps {
  /** 저장 전 미리보기 토큰 — 초안도 함께 (T-261) */
  draftToken?: string
}

const textFields = (item: PublicContentItem): PublicFieldValue[] =>
  item.fields.filter((f) => !SPECIAL_FIELDS.has(f.key) && f.field_type !== 'IMAGE')

const linkOf = (item: PublicContentItem): string | null => {
  const link = item.fields.find((f) => f.key === LINK_FIELD)
  return link ? fieldValueHref(link) : null
}

const whenOf = (item: PublicContentItem): string => {
  const year = item.fields.find((f) => f.key === YEAR_FIELD)
  const month = item.fields.find((f) => f.key === MONTH_FIELD)
  if (!year) return item.published_at ? item.published_at.slice(0, 4) : ''
  return month ? `${fieldValueText(year)}.${String(month.value).padStart(2, '0')}` : fieldValueText(year)
}

/** 저장 전 미리보기에서만 — 아직 공개하지 않은 콘텐츠 (T-261) */
const DraftMark = ({ item }: { item: PublicContentItem }) =>
  item.is_draft ? <span className="content-list__draft">초안</span> : null

const Fields = ({ item, className }: { item: PublicContentItem; className: string }) => {
  const fields = textFields(item)
  if (!fields.length) return null
  return <span className={className}>{fields.map(fieldValueText).join(' · ')}</span>
}

/** 링크 칸이 있으면 새 창으로, 없으면 그냥 상자 */
const Linked = ({
  href,
  className,
  label,
  children,
}: {
  href: string | null
  className: string
  label?: string
  children: React.ReactNode
}) =>
  href ? (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
      {children}
    </a>
  ) : (
    <div className={className}>{children}</div>
  )

/**
 * 콘텐츠 연결 (CONTENT_LIST) — hospital-a 디자인 (T-263, 콘텐츠 관리 기획서 5장).
 * 데이터 · 칸 · 동작은 테마형(components/sections/ContentList)과 같고 화면만 템플릿 BEM + SCSS.
 * 카드는 게시판 갤러리형, 목록은 웹진형, FAQ 는 FAQ형 스타일을 그대로 쓰고 연혁 · 로고 줄은 content-list.
 * 스위치 꺼짐 · 유형 없음은 관리자에게만 안내 (T-261).
 */
export async function ContentList({ section, tenantSlug, editable, draftToken }: Props) {
  const { typeId, mode, sort, category, tag, count, emptyText } = contentOptions(section)
  if (!typeId) return null
  const items = await fetchContentItems(tenantSlug, typeId, {
    limit: count,
    sort,
    category,
    tag,
    body: mode === 'FAQ',
    ...(draftToken ? { draft: draftToken } : {}),
  })
  if (items === 'ERROR') return null
  if (typeof items === 'string') return <ContentListNotice sectionId={section.id} reason={items} />
  if (!items.length && !emptyText) return null
  const id = titleId('content-list', section.id)
  const title = getString(section.settings, 'section_title')

  return (
    <section
      className={`content-list content-list--${mode.toLowerCase()}`}
      data-section-id={section.id}
      data-section-type="CONTENT_LIST"
      aria-labelledby={title ? id : undefined}
    >
      <div className="page-container">
        {(title || editable) && (
          <header className="section-head section-head--sub">
            <TemplateText
              section={section}
              editable={editable}
              field="section_title"
              as="h2"
              id={id}
              className="section-head__title"
              maxLength={40}
            />
          </header>
        )}

        {!items.length ? (
          <p className="content-list__empty">{emptyText}</p>
        ) : mode === 'CARD' ? (
          <ul className="board-gallery board-gallery--cols-3">
            {items.map((item) => (
              <li className="board-gallery__item" key={item.id}>
                <Linked href={linkOf(item)} className="board-gallery__link">
                  {item.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 고객이 올린 사진
                    <img className="board-gallery__image" src={item.thumbnail} alt="" loading="lazy" />
                  ) : (
                    <span className="board-gallery__image board-gallery__image--empty" aria-hidden="true" />
                  )}
                  <span className="board-gallery__subject">
                    {item.title}
                    <DraftMark item={item} />
                  </span>
                  <Fields item={item} className="board-gallery__fields" />
                  {item.summary && <span className="content-list__summary">{item.summary}</span>}
                </Linked>
              </li>
            ))}
          </ul>
        ) : mode === 'FAQ' ? (
          <div className="board-faq">
            {items.map((item) => (
              <details className="board-faq__item" key={item.id}>
                <summary className="board-faq__question">
                  <span className="board-faq__heading">
                    {item.title}
                    <DraftMark item={item} />
                  </span>
                </summary>
                <div className="board-faq__answer">
                  {item.body && item.body.length > 0 ? <RichBody nodes={item.body} /> : <p>{item.summary}</p>}
                </div>
              </details>
            ))}
          </div>
        ) : mode === 'TIMELINE' ? (
          <ol className="content-list__timeline">
            {items.map((item) => (
              <li className="content-list__event" key={item.id}>
                <span className="content-list__when">{whenOf(item)}</span>
                <span className="content-list__event-body">
                  <strong className="content-list__event-title">
                    {item.title}
                    <DraftMark item={item} />
                  </strong>
                  <Fields item={item} className="content-list__fields" />
                  {item.summary && <span className="content-list__summary">{item.summary}</span>}
                </span>
              </li>
            ))}
          </ol>
        ) : mode === 'LOGO' ? (
          <ul className="content-list__logos">
            {items.map((item) => (
              <li className="content-list__logo" key={item.id}>
                <Linked href={linkOf(item)} className="content-list__logo-box" label={item.title}>
                  {item.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 고객이 올린 로고
                    <img className="content-list__logo-image" src={item.thumbnail} alt={item.title} loading="lazy" />
                  ) : (
                    <span className="content-list__logo-name">{item.title}</span>
                  )}
                </Linked>
                <DraftMark item={item} />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="board-webzine">
            {items.map((item) => (
              <li className="board-webzine__item" key={item.id}>
                <Linked href={linkOf(item)} className="board-webzine__link">
                  {item.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element -- 고객이 올린 사진
                    <img className="board-webzine__image" src={item.thumbnail} alt="" loading="lazy" />
                  )}
                  <span className="board-webzine__body">
                    <span className="board-webzine__subject">
                      {item.title}
                      <DraftMark item={item} />
                    </span>
                    {item.summary && <span className="board-webzine__summary">{item.summary}</span>}
                    <Fields item={item} className="board-webzine__fields" />
                  </span>
                </Linked>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
