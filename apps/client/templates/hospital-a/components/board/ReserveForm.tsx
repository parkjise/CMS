'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { publicApi } from '@/lib/api'
import { executeRecaptcha } from '@/lib/recaptcha'
import { digitsOnly, formatPhone, validateBoardForm } from './formValidation'

interface Props {
  tenantSlug: string
  /** 예약 시간대 (업종 운영 시간에 맞춰 섹션 설정 times 로 바꾼다) */
  times: string[]
}

const todayInSeoul = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())

/**
 * 온라인 예약 신청 — 목업 sub/reserve-form.html (POST /api/public/inquiries, inquiry_type=RESERVATION)
 * 목업의 보안문자 칸은 보이지 않는 reCAPTCHA 로 대신한다 (T-051).
 */
export function ReserveForm({ tenantSlug, times }: Props) {
  const [status, setStatus] = useState('')
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [minDate, setMinDate] = useState<string>()

  useEffect(() => setMinDate(todayInSeoul()), [])

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const error = validateBoardForm(form)
    if (error) {
      setSuccess(false)
      setStatus(error)
      return
    }
    const data = new FormData(form)
    setSubmitting(true)
    try {
      const recaptchaToken = await executeRecaptcha(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY, 'reservation')
      await publicApi.post(
        '/inquiries',
        {
          inquiry_type: 'RESERVATION',
          name: String(data.get('name')).trim(),
          phone: formatPhone(String(data.get('tel'))),
          subject: String(data.get('subject')).trim(),
          message: String(data.get('content')).trim(),
          reserved_date: String(data.get('date')),
          reserved_time: String(data.get('time')),
          recaptcha_token: recaptchaToken ?? undefined,
        },
        { params: { tenant_slug: tenantSlug } },
      )
      setSuccess(true)
      setStatus('예약 신청이 접수되었습니다. 확인 후 연락드리겠습니다.')
      form.reset()
    } catch {
      setSuccess(false)
      setStatus('접수 중 오류가 발생했습니다. 입력 내용을 확인한 뒤 다시 시도해 주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="board-form" aria-labelledby="reserve-form-title">
      <div className="page-container">
        <h2 className="sr-only" id="reserve-form-title">
          온라인 예약 신청
        </h2>
        <form className="board-form__form" noValidate onSubmit={onSubmit}>
          <div className="board-form__panel">
            <p className="board-form__note">
              <span className="board-form__req" aria-hidden="true">*</span>는 필수 표기 항목입니다.
            </p>
            <div className="board-form__list">
              <div className="board-form__row">
                <label className="board-form__label" htmlFor="rv-name">
                  이름<span className="board-form__req" aria-hidden="true">*</span>
                </label>
                <input className="board-form__input" type="text" id="rv-name" name="name" placeholder="이름을 입력해 주세요." autoComplete="name" maxLength={100} required data-error="이름을 입력해 주세요." />
              </div>
              <fieldset className="board-form__row">
                <legend className="board-form__label">
                  희망 날짜 &amp; 시간대<span className="board-form__req" aria-hidden="true">*</span>
                </legend>
                <div className="board-form__cols">
                  <div className="board-form__field">
                    <label className="sr-only" htmlFor="rv-date">
                      희망 날짜
                    </label>
                    <input className="board-form__input" type="date" id="rv-date" name="date" min={minDate} required data-error="희망 날짜를 선택해 주세요." />
                  </div>
                  <div className="board-form__field board-form__field--select">
                    <label className="sr-only" htmlFor="rv-time">
                      희망 시간대
                    </label>
                    <select className="board-form__input board-form__select" id="rv-time" name="time" required defaultValue="" data-error="희망 시간대를 선택해 주세요.">
                      <option value="" disabled>
                        시간대 선택
                      </option>
                      {times.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <i className="ri-arrow-down-s-line" aria-hidden="true" />
                  </div>
                </div>
              </fieldset>
              <div className="board-form__row">
                <label className="board-form__label" htmlFor="rv-tel">
                  연락처<span className="board-form__req" aria-hidden="true">*</span>
                </label>
                <input
                  className="board-form__input"
                  type="tel"
                  id="rv-tel"
                  name="tel"
                  placeholder="숫자만 입력해 주세요."
                  inputMode="numeric"
                  autoComplete="tel"
                  minLength={10}
                  maxLength={11}
                  required
                  data-error="연락처를 입력해 주세요."
                  data-error-short="연락처를 정확히 입력해 주세요."
                  data-pattern="01[016789]\d{7,8}"
                  data-error-pattern="휴대폰 번호를 정확히 입력해 주세요."
                  onInput={(e) => {
                    e.currentTarget.value = digitsOnly(e.currentTarget.value)
                  }}
                />
              </div>
              <div className="board-form__row">
                <label className="board-form__label" htmlFor="rv-subject">
                  제목<span className="board-form__req" aria-hidden="true">*</span>
                </label>
                <input className="board-form__input" type="text" id="rv-subject" name="subject" placeholder="제목을 입력해 주세요." maxLength={200} required data-error="제목을 입력해 주세요." />
              </div>
              <div className="board-form__row">
                <label className="board-form__label" htmlFor="rv-content">
                  내용<span className="board-form__req" aria-hidden="true">*</span>
                </label>
                <textarea className="board-form__input board-form__textarea" id="rv-content" name="content" placeholder="상담받고 싶은 내용을 입력해 주세요." minLength={10} maxLength={1000} required data-error="내용을 입력해 주세요." data-error-short="내용을 10자 이상 입력해 주세요." />
              </div>
              <div className="board-form__row board-form__row--check">
                <input className="board-form__checkbox" type="checkbox" id="rv-agree" name="agree" required data-error="이용약관 및 개인정보 수집·이용에 동의해 주세요." />
                <label className="board-form__check" htmlFor="rv-agree">
                  이용약관 및 개인정보 수집·이용 동의<span className="board-form__req" aria-hidden="true">*</span>
                </label>
                <a className="board-form__terms" href="#">
                  [보기]
                </a>
              </div>
            </div>
            <p className={`board-form__status${success ? ' board-form__status--success' : ''}`} role="status" aria-live="polite">
              {status}
            </p>
          </div>
          <div className="board-form__actions">
            <button className="board-form__submit" type="submit" disabled={submitting}>
              {submitting ? '접수 중…' : '등록'}
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
