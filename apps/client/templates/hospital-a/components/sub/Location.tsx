import { getString } from '@/lib/sectionSettings'
import type { CodeSectionProps } from '../../../shared/contracts'
import { CommonSettingsHint } from '../../../shared/CommonSettingsHint'
import { TemplateText } from '../../../shared/TemplateText'
import { SectionHead } from './SectionHead'
import { RichLine } from './RichText'
import { titleId } from './ids'

interface Props extends CodeSectionProps {
  /** 사이트 공통 정보 (resolveSiteInfo) — 사업체 정보는 실제 값만, 없으면 '' */
  business?: Record<string, string>
}

type Row = { label: string; value: string; kind?: 'address' | 'tel' | 'lines' }

/**
 * 오시는 길 — 목업 sections/location.html (MAP)
 * 설정 키: eyebrow · title · description · transit (인라인 편집) · address · phone · parking ·
 *          map_embed_url(지도 퍼가기 주소 — 비어 있으면 자리 표시)
 * 주소 · 대표전화 · 주차 · 운영 시간은 관리자 공통 설정(사업체 정보)이 먼저 — 푸터와 한 곳에서 관리.
 * 공통 설정이 비어 있으면 섹션 값(템플릿 샘플)을 보여 준다 (T-125-F)
 */
export function Location({ business = {}, ...props }: Props) {
  const { section, editable } = props
  const id = titleId('location', section.id)
  const s = (key: string) => getString(section.settings, key)
  const mapUrl = s('map_embed_url')
  const hours = [
    business.hours_weekday && `평일 ${business.hours_weekday}`,
    business.hours_saturday && `토요일 ${business.hours_saturday}`,
    business.hours_note,
  ].filter(Boolean) as string[]
  const rows: Row[] = [
    { label: '주소', value: business.address || s('address'), kind: 'address' },
    { label: '대표전화', value: business.phone || s('phone'), kind: 'tel' },
    { label: '운영 시간', value: hours.join('\n'), kind: 'lines' },
    { label: '주차', value: business.parking || s('parking') },
  ]
  const transit = s('transit')

  return (
    <section className="location" aria-labelledby={id}>
      <div className="page-container">
        <SectionHead {...props} id={id} />

        {mapUrl ? (
          <div className="location__map">
            <iframe
              src={mapUrl}
              title={`${s('title') || '위치'} 지도`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
             
            />
          </div>
        ) : (
          <div className="location__map" role="img" aria-label="위치 지도 (지도 영역)">
            <span className="location__map-placeholder" aria-hidden="true">
              <i className="ri-map-pin-2-line" /> 지도 영역
            </span>
          </div>
        )}

        <dl className="location__info">
          {rows
            .filter((r) => r.value)
            .map((r) => (
              <div className="location__info-row" key={r.label}>
                <dt className="location__info-label">{r.label}</dt>
                <dd className="location__info-value">
                  {r.kind === 'address' ? (
                    <address>{r.value}</address>
                  ) : r.kind === 'tel' ? (
                    <a className="location__info-link" href={`tel:${r.value.replace(/[^0-9]/g, '')}`}>
                      {r.value}
                    </a>
                  ) : (
                    <RichLine text={r.value} />
                  )}
                </dd>
              </div>
            ))}
          {/* 대중교통은 공통 설정에 없는 칸 — 섹션 글자라 편집 모드에서 바로 고친다 */}
          {transit && (
            <div className="location__info-row">
              <dt className="location__info-label">대중교통</dt>
              <dd className="location__info-value">
                <TemplateText section={section} editable={editable} field="transit" multiline maxLength={300} />
              </dd>
            </div>
          )}
        </dl>
        <CommonSettingsHint what="주소 · 대표전화 · 운영 시간 · 주차" editable={editable} />
      </div>
    </section>
  )
}
