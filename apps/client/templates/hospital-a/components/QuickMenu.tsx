'use client'

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { publicApi } from '@/lib/api'
import { executeRecaptcha } from '@/lib/recaptcha'

export interface QuickLink {
  href: string
  label: string
  icon: string
  external?: boolean
}

interface Props {
  tenantSlug: string
  links: QuickLink[]
  phone?: string
  kakaoUrl?: string
  locationHref: string
}

const TOPICS = ['서비스 안내', '예약 · 일정', '가격 · 결제', '기타 문의']
const PHONE_RE = /^01[016789]-?\d{3,4}-?\d{4}$/

/**
 * 퀵메뉴 · 간편상담 · 상단으로 — 목업 components/quick-menu.html + assets/js/quick-menu.js
 * - md 이상: 오른쪽 아래 세로 버튼 3개 / md 미만: 하단 고정 바
 * - 간편상담 접수: 문의 API (AD-04 로 들어감, ContactForm 과 같은 경로)
 */
export function QuickMenu({ tenantSlug, links, phone, kakaoUrl, locationHref }: Props) {
  const [shortcutOpen, setShortcutOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [status, setStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const lastOpener = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)
  const toggleRef = useRef<HTMLButtonElement | null>(null)

  const openPanel = (opener: HTMLButtonElement) => {
    const reopen = !panelOpen || lastOpener.current !== opener
    lastOpener.current = opener
    setPanelOpen(reopen)
    if (reopen) {
      setStatus('')
      setShortcutOpen(false)
    }
  }
  const closePanel = () => {
    setPanelOpen(false)
    lastOpener.current?.focus()
  }

  useEffect(() => {
    if (panelOpen) panelRef.current?.querySelector('input')?.focus({ preventScroll: true })
  }, [panelOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (panelOpen) closePanel()
      else if (shortcutOpen) {
        setShortcutOpen(false)
        toggleRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const invalid = form.querySelector<HTMLInputElement | HTMLSelectElement>(':invalid')
    if (invalid) {
      setStatus(invalid.type === 'checkbox' ? '필수 동의 항목에 체크해주세요.' : '필수 항목을 입력해주세요.')
      invalid.focus()
      return
    }
    const data = new FormData(form)
    const phoneValue = String(data.get('phone') ?? '').trim()
    if (!PHONE_RE.test(phoneValue)) {
      setStatus('올바른 휴대폰 번호를 입력해주세요. (예: 010-1234-5678)')
      form.querySelector<HTMLInputElement>('[name="phone"]')?.focus()
      return
    }

    setSubmitting(true)
    try {
      const recaptchaToken = await executeRecaptcha(
        process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY,
        'quick_consult_submit',
      )
      await publicApi.post(
        '/inquiries',
        {
          inquiry_type: 'GENERAL',
          name: String(data.get('name') ?? '').trim(),
          phone: phoneValue,
          message: `[간편상담] 상담 분야: ${String(data.get('topic'))} (상담 연락 수신 동의)`,
          recaptcha_token: recaptchaToken ?? undefined,
        },
        { params: { tenant_slug: tenantSlug } },
      )
      setStatus('상담 신청이 접수되었습니다. 담당자가 곧 연락드리겠습니다.')
      form.reset()
    } catch {
      setStatus('접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  const toTop = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
    document.getElementById('main')?.focus({ preventScroll: true })
  }

  const telHref = phone ? `tel:${phone.replace(/[^0-9]/g, '')}` : undefined
  const shortcutStyle = { '--quick-menu-link-count': String(links.length) } as CSSProperties

  return (
    <aside className="quick-menu" aria-label="빠른 메뉴">
      <div className="quick-menu__rail">
        <div
          className={`quick-menu__shortcut${shortcutOpen ? ' quick-menu__shortcut--open' : ''}`}
          style={shortcutStyle}
        >
          <ul className="quick-menu__links" id="quick-menu-links">
            {links.map((link) => (
              <li key={link.label}>
                <a
                  className="quick-menu__link"
                  href={link.href}
                  {...(link.external ? { target: '_blank', rel: 'noopener' } : {})}
                >
                  <i className={link.icon} aria-hidden="true" />
                  {link.external ? (
                    <span>
                      {link.label}
                      <span className="sr-only">(새 창)</span>
                    </span>
                  ) : (
                    link.label
                  )}
                </a>
              </li>
            ))}
          </ul>
          <button
            ref={toggleRef}
            className="quick-menu__button quick-menu__button--toggle"
            type="button"
            aria-expanded={shortcutOpen}
            aria-controls="quick-menu-links"
            onClick={() => setShortcutOpen((v) => !v)}
          >
            <i className="ri-flashlight-fill" aria-hidden="true" />
            퀵메뉴
          </button>
        </div>

        <button
          className="quick-menu__button quick-menu__button--consult"
          type="button"
          aria-expanded={panelOpen}
          aria-controls="quick-consult"
          onClick={(e) => openPanel(e.currentTarget)}
        >
          <i className="ri-edit-2-line" aria-hidden="true" />
          간편상담
        </button>

        <button
          className="quick-menu__button quick-menu__button--top"
          type="button"
          aria-label="페이지 맨 위로"
          onClick={toTop}
        >
          <i className="ri-skip-up-line" aria-hidden="true" />
        </button>
      </div>

      <section
        ref={panelRef}
        className={`quick-menu__panel${panelOpen ? ' quick-menu__panel--open' : ''}`}
        id="quick-consult"
        role="dialog"
        aria-labelledby="quick-consult-title"
      >
        <h2 className="quick-menu__panel-title" id="quick-consult-title">
          간편상담
        </h2>
        <p className="quick-menu__panel-desc">
          신청을 남겨주시면 빠른 시간 안에
          <br />
          담당자가 연락드리겠습니다.
        </p>

        <form className="quick-menu__form" noValidate onSubmit={onSubmit}>
          <div className="quick-menu__field">
            <input className="quick-menu__input" type="text" id="quick-name" name="name" autoComplete="name" placeholder=" " required maxLength={100} />
            <label className="quick-menu__label" htmlFor="quick-name">
              이름을 입력해주세요.<span aria-hidden="true">*</span>
            </label>
          </div>
          <div className="quick-menu__field">
            <input className="quick-menu__input" type="tel" id="quick-phone" name="phone" inputMode="tel" autoComplete="tel" placeholder=" " required />
            <label className="quick-menu__label" htmlFor="quick-phone">
              연락처를 입력해주세요.<span aria-hidden="true">*</span>
            </label>
          </div>
          <div className="quick-menu__field quick-menu__field--select">
            <label className="sr-only" htmlFor="quick-topic">
              상담 분야
            </label>
            <select className="quick-menu__input" id="quick-topic" name="topic" required defaultValue="">
              <option value="">상담 분야를 선택해주세요</option>
              {TOPICS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <i className="ri-arrow-down-s-line" aria-hidden="true" />
          </div>

          <div className="quick-menu__agree">
            <input className="quick-menu__check sr-only" type="checkbox" id="quick-agree-call" name="agreeCall" required />
            <label className="quick-menu__check-label" htmlFor="quick-agree-call">
              <i className="ri-check-line" aria-hidden="true" />
              상담 연락 수신 동의
            </label>
          </div>
          <div className="quick-menu__agree">
            <input className="quick-menu__check sr-only" type="checkbox" id="quick-agree-privacy" name="agreePrivacy" required />
            <label className="quick-menu__check-label" htmlFor="quick-agree-privacy">
              <i className="ri-check-line" aria-hidden="true" />
              개인정보 수집 및 이용 동의
            </label>
            <a className="quick-menu__more" href="#">
              자세히보기
            </a>
          </div>

          <p className="quick-menu__status" role="status" aria-live="polite">
            {status}
          </p>
          <button className="quick-menu__submit" type="submit" disabled={submitting}>
            {submitting ? '접수 중…' : '신청하기'}
          </button>
        </form>

        <button className="quick-menu__close" type="button" aria-label="간편상담 닫기" onClick={closePanel}>
          <i className="ri-close-line" aria-hidden="true" />
        </button>
      </section>

      <nav className="quick-menu__bar" aria-label="모바일 빠른 메뉴">
        <ul className="quick-menu__bar-list">
          {telHref && (
            <li>
              <a className="quick-menu__bar-item" href={telHref}>
                <i className="ri-phone-line" aria-hidden="true" />
                전화 상담
              </a>
            </li>
          )}
          <li>
            <button
              className="quick-menu__bar-item"
              type="button"
              aria-expanded={panelOpen}
              aria-controls="quick-consult"
              onClick={(e) => openPanel(e.currentTarget)}
            >
              <i className="ri-edit-2-line" aria-hidden="true" />
              간편상담
            </button>
          </li>
          {kakaoUrl && (
            <li>
              <a className="quick-menu__bar-item" href={kakaoUrl} target="_blank" rel="noopener">
                <i className="ri-kakao-talk-line" aria-hidden="true" />
                <span>
                  카카오톡<span className="sr-only">(새 창)</span>
                </span>
              </a>
            </li>
          )}
          <li>
            <a className="quick-menu__bar-item" href={locationHref}>
              <i className="ri-map-pin-line" aria-hidden="true" />
              오시는 길
            </a>
          </li>
        </ul>
      </nav>
    </aside>
  )
}
