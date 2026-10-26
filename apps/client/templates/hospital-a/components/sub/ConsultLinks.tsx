import type { CodeSectionProps } from '../../../shared/contracts'
import { SectionHead } from './SectionHead'
import { titleId } from './ids'

interface Props extends CodeSectionProps {
  consultHref: string
  kakaoUrl?: string
  phone?: string
}

/**
 * 상담·예약 채널 버튼 3종 — 목업 sub/consult-links.html (layout=consult-links)
 * 설정 키: eyebrow · title (인라인 편집) / 링크는 사이트 정보(전화·카카오)와 상담 페이지에서 가져온다
 */
export function ConsultLinks({ consultHref, kakaoUrl, phone, ...props }: Props) {
  const id = titleId('consult-links', props.section.id)
  const tel = phone?.replace(/[^0-9]/g, '')
  return (
    <section className="consult-links" aria-labelledby={id}>
      <div className="page-container">
        <SectionHead {...props} id={id} sub />
        <ul className="consult-links__list">
          <li>
            <a className="consult-links__button" href={consultHref}>
              <i className="ri-chat-3-line consult-links__icon" aria-hidden="true" />
              <span className="consult-links__text">
                <span className="consult-links__sub">궁금한 내용을 자세하게</span>
                <strong className="consult-links__main">온라인 상담</strong>
              </span>
            </a>
          </li>
          {kakaoUrl && (
            <li>
              <a className="consult-links__button" href={kakaoUrl} target="_blank" rel="noopener noreferrer">
                <i className="ri-kakao-talk-fill consult-links__icon" aria-hidden="true" />
                <span className="consult-links__text">
                  <span className="consult-links__sub">빠르고 간편하게</span>
                  <strong className="consult-links__main">카카오톡 상담</strong>
                </span>
                <span className="sr-only">(새 창)</span>
              </a>
            </li>
          )}
          {phone && (
            <li>
              <a className="consult-links__button" href={`tel:${tel}`}>
                <i className="ri-phone-line consult-links__icon" aria-hidden="true" />
                <span className="consult-links__text">
                  <span className="consult-links__sub">전화 상담</span>
                  <strong className="consult-links__main">{phone.replaceAll('-', '. ')}</strong>
                </span>
              </a>
            </li>
          )}
        </ul>
      </div>
    </section>
  )
}
