import { getString } from '@/lib/sectionSettings'
import type { CodeSectionProps } from '../../../shared/contracts'
import { SectionHead } from './SectionHead'
import { RichLine } from './RichText'
import { titleId } from './ids'

/**
 * 오시는 길 — 목업 sections/location.html (MAP)
 * 설정 키: eyebrow · title · description (인라인 편집) · address · phone · transit · parking ·
 *          map_embed_url(지도 퍼가기 주소 — 비어 있으면 자리 표시)
 */
export function Location(props: CodeSectionProps) {
  const { section } = props
  const id = titleId('location', section.id)
  const s = (key: string) => getString(section.settings, key)
  const mapUrl = s('map_embed_url')
  const rows: { label: string; value: string; kind?: 'address' | 'tel' }[] = [
    { label: '주소', value: s('address'), kind: 'address' },
    { label: '대표전화', value: s('phone'), kind: 'tel' },
    { label: '대중교통', value: s('transit') },
    { label: '주차', value: s('parking') },
  ]

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
        </dl>
      </div>
    </section>
  )
}
