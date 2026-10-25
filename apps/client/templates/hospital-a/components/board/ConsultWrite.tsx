'use client'

import { useState, type FormEvent } from 'react'
import { publicApi } from '@/lib/api'
import { executeRecaptcha } from '@/lib/recaptcha'
import { digitsOnly, formatPhone, validateBoardForm } from './formValidation'

interface Props {
  tenantSlug: string
  listHref: string
  /** 등록 후 이동할 상세 주소 — '__ID__' 자리에 새 글 id (서버→클라이언트로 함수를 넘길 수 없어 문자열) */
  detailHrefTemplate: string
}

/**
 * 온라인 상담 글쓰기 — 목업 sub/consult-write.html (POST /api/public/inquiries/board)
 * 목업의 보안문자 칸은 실제로는 보이지 않는 reCAPTCHA 로 대신한다 (T-051).
 */
export function ConsultWrite({ tenantSlug, listHref, detailHrefTemplate }: Props) {
  const [status, setStatus] = useState('')
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

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
      const recaptchaToken = await executeRecaptcha(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY, 'consult_write')
      const { data: res } = await publicApi.post(
        '/inquiries/board',
        {
          name: String(data.get('name')).trim(),
          password: String(data.get('password')),
          phone: formatPhone(String(data.get('tel'))),
          subject: String(data.get('subject')).trim(),
          message: String(data.get('content')).trim(),
          is_secret: data.get('secret') === 'on',
          recaptcha_token: recaptchaToken ?? undefined,
        },
        { params: { tenant_slug: tenantSlug } },
      )
      setSuccess(true)
      setStatus('상담 글이 등록되었습니다. 확인 후 빠르게 답변드리겠습니다.')
      form.reset()
      const postId = res?.data?.post_id as string | undefined
      if (postId) {
        setTimeout(() => window.location.assign(detailHrefTemplate.replace('__ID__', postId)), 1200)
      }
    } catch {
      setSuccess(false)
      setStatus('등록 중 오류가 발생했습니다. 입력 내용을 확인한 뒤 다시 시도해 주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="board-form" aria-labelledby="consult-write-title">
      <div className="page-container">
        <h2 className="sr-only" id="consult-write-title">
          온라인 상담 글쓰기
        </h2>
        <form className="board-form__form" noValidate onSubmit={onSubmit}>
          <div className="board-form__panel">
            <p className="board-form__note">
              <span className="board-form__req" aria-hidden="true">*</span>는 필수 표기 항목입니다.
            </p>
            <div className="board-form__list">
              <div className="board-form__cols board-form__cols--fields">
                <div className="board-form__row">
                  <label className="board-form__label" htmlFor="cw-name">
                    이름<span className="board-form__req" aria-hidden="true">*</span>
                  </label>
                  <input className="board-form__input" type="text" id="cw-name" name="name" placeholder="이름을 입력해 주세요." autoComplete="name" maxLength={100} required data-error="이름을 입력해 주세요." />
                </div>
                <div className="board-form__row">
                  <label className="board-form__label" htmlFor="cw-password">
                    비밀번호<span className="board-form__req" aria-hidden="true">*</span>
                  </label>
                  <input className="board-form__input" type="password" id="cw-password" name="password" placeholder="4자리 이상 입력해 주세요." autoComplete="new-password" minLength={4} maxLength={50} aria-describedby="cw-password-help" required data-error="비밀번호를 입력해 주세요." data-error-short="비밀번호를 4자리 이상 입력해 주세요." />
                  <p className="board-form__help" id="cw-password-help">
                    글을 확인하거나 수정할 때 필요해요.
                  </p>
                </div>
              </div>
              <div className="board-form__row">
                <label className="board-form__label" htmlFor="cw-tel">
                  연락처<span className="board-form__req" aria-hidden="true">*</span>
                </label>
                <input
                  className="board-form__input"
                  type="tel"
                  id="cw-tel"
                  name="tel"
                  placeholder="숫자만 입력해 주세요."
                  inputMode="numeric"
                  autoComplete="tel"
                  minLength={9}
                  maxLength={11}
                  required
                  data-error="연락처를 입력해 주세요."
                  data-error-short="연락처를 정확히 입력해 주세요."
                  onInput={(e) => {
                    e.currentTarget.value = digitsOnly(e.currentTarget.value)
                  }}
                />
              </div>
              <div className="board-form__row">
                <label className="board-form__label" htmlFor="cw-subject">
                  제목<span className="board-form__req" aria-hidden="true">*</span>
                </label>
                <input className="board-form__input" type="text" id="cw-subject" name="subject" placeholder="제목을 입력해 주세요." maxLength={60} required data-error="제목을 입력해 주세요." />
              </div>
              <div className="board-form__row">
                <label className="board-form__label" htmlFor="cw-content">
                  내용<span className="board-form__req" aria-hidden="true">*</span>
                </label>
                <textarea className="board-form__input board-form__textarea" id="cw-content" name="content" placeholder="상담받고 싶은 내용을 자세히 적어 주세요." minLength={10} maxLength={2000} required data-error="내용을 입력해 주세요." data-error-short="내용을 10자 이상 입력해 주세요." />
              </div>
              <div className="board-form__row board-form__row--check">
                <input className="board-form__checkbox" type="checkbox" id="cw-secret" name="secret" defaultChecked />
                <label className="board-form__check" htmlFor="cw-secret">
                  비밀글로 등록 <span className="board-form__help">(작성자와 관리자만 볼 수 있어요)</span>
                </label>
              </div>
              <div className="board-form__row board-form__row--check">
                <input className="board-form__checkbox" type="checkbox" id="cw-agree" name="agree" required data-error="이용약관 및 개인정보 수집·이용에 동의해 주세요." />
                <label className="board-form__check" htmlFor="cw-agree">
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
            <a className="board-form__cancel" href={listHref}>
              취소
            </a>
            <button className="board-form__submit" type="submit" disabled={submitting}>
              {submitting ? '등록 중…' : '등록'}
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
