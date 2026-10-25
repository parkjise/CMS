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
  const mapLinks = [
    { href: info.naver_map_url, label: '네이버 길찾기' },
    { href: info.kakao_map_url, label: '카카오 길찾기' },
    { href: info.tmap_url, label: '티맵 길찾기' },
  ].filter((l) => l.href)

  return (
    <footer className="footer" id="contact">
      <div className="page-container footer__inner">
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

        <section className="footer__block footer__block--hours" aria-labelledby="footer-hours-title">
          <h2 className="footer__title" id="footer-hours-title">
            운영 시간
          </h2>
          <dl className="footer__hours">
            <div className="footer__hours-row">
              <dt className="footer__hours-day footer__hours-day--spaced">평일</dt>
              <dd className="footer__hours-time">{info.hours_weekday}</dd>
            </div>
            {info.hours_saturday && (
              <div className="footer__hours-row">
                <dt className="footer__hours-day">토요일</dt>
                <dd className="footer__hours-time">{info.hours_saturday}</dd>
              </div>
            )}
          </dl>
          {info.hours_note && <p className="footer__note">{info.hours_note}</p>}
        </section>

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
            <span className="footer__company-item">{info.brand_name}</span>
            {info.ceo && <span className="footer__company-item">대표자 {info.ceo}</span>}
            {info.business_number && (
              <span className="footer__company-item">사업자등록번호 {info.business_number}</span>
            )}
            <br />
            <span className="footer__company-item">{info.address}</span>
            {info.phone && <span className="footer__company-item">TEL {info.phone}</span>}
          </p>
          <p className="footer__copyright">
            <small>
              Copyright &copy; {year} {info.brand_name}. All rights reserved.
            </small>
          </p>
        </div>
      </div>
    </footer>
  )
}
