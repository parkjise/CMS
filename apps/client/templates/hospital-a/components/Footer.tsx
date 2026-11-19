import { siteHoursRows } from '../../shared/siteHoursRows'

interface Props {
  info: Record<string, string>
}

const external = { target: '_blank', rel: 'noopener' } as const

/**
 * 푸터 — 목업 components/footer.html
 * 값은 사이트 공통 정보(siteInfo): 샘플 + 테넌트 상호·SNS (기획서 11.8)
 */
export function Footer({ info }: Props) {
  const year = new Date().getFullYear()
  const tel = info.phone?.replace(/[^0-9]/g, '')
  const hours = siteHoursRows(info)
  const businessKind = [info.business_type, info.business_item].filter(Boolean).join(' / ')
  const fullAddress = [info.postal_code && `(${info.postal_code})`, info.address].filter(Boolean).join(' ')
  const mapLinks = [
    { href: info.naver_map_url, label: '네이버 길찾기' },
    { href: info.kakao_map_url, label: '카카오 길찾기' },
    { href: info.tmap_url, label: '티맵 길찾기' },
  ].filter((l) => l.href)

  return (
    <footer className="footer" id="contact">
      <div className="page-container footer__inner">
        {(info.phone || info.kakao_url) && (
          <section className="footer__block footer__block--contact" aria-labelledby="footer-contact-title">
            <h2 className="footer__title" id="footer-contact-title">
              고객 상담
            </h2>
            {info.phone && (
              <p className="footer__phone">
                <a className="footer__phone-link" href={`tel:${tel}`}>
                  {info.phone}
                </a>
              </p>
            )}
            {info.kakao_url && (
              <ul className="footer__buttons">
                <li>
                  <a className="footer__button" href={info.kakao_url} {...external}>
                    카카오톡 상담<span className="sr-only">(새 창)</span>
                  </a>
                </li>
              </ul>
            )}
          </section>
        )}

        {(hours.length > 0 || info.hours_note || info.hours_temp_note) && (
          <section className="footer__block footer__block--hours" aria-labelledby="footer-hours-title">
            <h2 className="footer__title" id="footer-hours-title">
              운영 시간
            </h2>
            {hours.length > 0 && (
              <dl className="footer__hours">
                {hours.map((row) => (
                  <div className="footer__hours-row" key={row.days}>
                    <dt
                      className={`footer__hours-day${row.days.length === 2 ? ' footer__hours-day--spaced' : ''}`}
                    >
                      {row.days}
                    </dt>
                    <dd className="footer__hours-time">{row.time}</dd>
                  </div>
                ))}
              </dl>
            )}
            {info.hours_note && <p className="footer__note">{info.hours_note}</p>}
            {info.hours_temp_note && <p className="footer__note">{info.hours_temp_note}</p>}
          </section>
        )}

        {info.address && (
          <section className="footer__block footer__block--location" aria-labelledby="footer-location-title">
            <h2 className="footer__title" id="footer-location-title">
              오시는 길
            </h2>
            <address className="footer__text">{info.address}</address>
            {mapLinks.length > 0 && (
              <ul className="footer__buttons">
                {mapLinks.map((l) => (
                  <li key={l.label}>
                    <a className="footer__button" href={l.href} {...external}>
                      {l.label}
                      <span className="sr-only">(새 창)</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {info.parking && (
          <section className="footer__block footer__block--parking" aria-labelledby="footer-parking-title">
            <h2 className="footer__title" id="footer-parking-title">
              주차 안내
            </h2>
            <p className="footer__text">{info.parking}</p>
          </section>
        )}

        <div className="footer__block footer__block--legal">
          <nav className="footer__policy" aria-label="약관 및 정책">
            <ul className="footer__policy-list">
              <li>
                <a className="footer__policy-link" href={info.terms_url}>
                  이용약관
                </a>
              </li>
              <li>
                <a className="footer__policy-link" href={info.privacy_url}>
                  개인정보처리방침
                </a>
              </li>
            </ul>
          </nav>
          <p className="footer__company">
            <span className="footer__company-item">{info.company_name || info.brand_name}</span>
            {info.ceo && <span className="footer__company-item">대표자 {info.ceo}</span>}
            {info.business_number && (
              <span className="footer__company-item">사업자등록번호 {info.business_number}</span>
            )}
            {info.mail_order_number && (
              <span className="footer__company-item">통신판매업 신고번호 {info.mail_order_number}</span>
            )}
            {businessKind && <span className="footer__company-item">업태 · 종목 {businessKind}</span>}
            <br />
            {fullAddress && <span className="footer__company-item">{fullAddress}</span>}
            {info.phone && <span className="footer__company-item">TEL {info.phone}</span>}
            {info.cs_phone && <span className="footer__company-item">고객센터 {info.cs_phone}</span>}
            {info.fax && <span className="footer__company-item">FAX {info.fax}</span>}
            {info.email && <span className="footer__company-item">{info.email}</span>}
            {info.privacy_officer && (
              <span className="footer__company-item">
                개인정보 보호책임자 {info.privacy_officer}
                {info.privacy_email && ` (${info.privacy_email})`}
              </span>
            )}
          </p>
          <p className="footer__copyright">
            <small>{info.copyright || `Copyright © ${year} ${info.brand_name}. All rights reserved.`}</small>
          </p>
        </div>
      </div>
    </footer>
  )
}
