'use client'

/**
 * hospital-a 회원 화면 공통 조각 — 목업 components/sub/{password-field · phone-verify · member-agree ·
 * member-sns · find-tabs}.html 마크업 그대로. 로직은 hooks/member (공통 화면과 같은 훅).
 */
import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import type { FieldErrors, FieldValues, UseFormRegister } from 'react-hook-form'
import { useAuthOptions } from '@/hooks/member/useMemberAuth'
import { usePhoneVerification, type PhoneVerificationArgs } from '@/hooks/member/useMemberForms'
import { passwordChecks } from '@/lib/memberSchemas'
import { fetchSocialAuthorizeUrl, socialErrorMessage, type SocialProvider } from '@/lib/memberSocial'

/** 필드 순서대로 첫 오류 (목업 board-form.js — 상태 줄에 하나만 보여 줌) */
export const firstError = (errors: FieldErrors, order: string[]): string | null => {
  for (const key of order) {
    const message = errors[key]?.message
    if (typeof message === 'string') return message
  }
  return null
}

export const Req = () => (
  <span className="board-form__req" aria-hidden="true">
    *
  </span>
)

/** 상태 줄 — 오류 / 완료 안내 (role=status) */
export const StatusLine = ({ message, success = false }: { message: string | null; success?: boolean }) => (
  <p className={`board-form__status${success ? ' board-form__status--success' : ''}`} role="status" aria-live="polite">
    {message}
  </p>
)

type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }

/** 비밀번호 + 보기 버튼 (목업 .member-form__password) */
export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(({ invalid, ...props }, ref) => {
  const [visible, setVisible] = useState(false)
  return (
    <div className="member-form__password">
      <input
        ref={ref}
        className="board-form__input"
        type={visible ? 'text' : 'password'}
        aria-invalid={invalid || undefined}
        {...props}
      />
      <button
        className="member-form__eye"
        type="button"
        aria-label={visible ? '비밀번호 숨기기' : '비밀번호 보기'}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
      >
        <i className={visible ? 'ri-eye-off-line' : 'ri-eye-line'} aria-hidden="true" />
      </button>
    </div>
  )
})
PasswordInput.displayName = 'PasswordInput'

const RULES = [
  ['length', '8자 이상'],
  ['letter', '영문'],
  ['digit', '숫자'],
] as const

/** 비밀번호 조건 표시 (목업 password-field.html) */
export const PasswordRules = ({ id, value }: { id: string; value: string }) => {
  const checks = passwordChecks(value)
  return (
    <ul className="member-form__rules" id={`${id}-rules`} aria-label="비밀번호 조건">
      {RULES.map(([key, label]) => (
        <li key={key} className={`member-form__rule${checks[key] ? ' member-form__rule--ok' : ''}`} data-ok={checks[key]}>
          {label}
          <span className="sr-only">{checks[key] ? ' 충족' : ' 미충족'}</span>
        </li>
      ))}
    </ul>
  )
}

/** 휴대폰 번호 + 인증번호 (목업 phone-verify.html) */
export const PhoneVerify = ({
  id,
  onPhoneChange,
  invalid,
  ...args
}: PhoneVerificationArgs & { id: string; onPhoneChange: (phone: string) => void; invalid?: boolean }) => {
  const pv = usePhoneVerification(args)
  const { phone, verified } = args
  const result = verified
    ? '휴대폰 인증이 완료되었어요.'
    : pv.expired
      ? '인증번호가 만료되었습니다. 다시 요청해주세요'
      : pv.message
  return (
    <div className="board-form__row">
      <label className="board-form__label" htmlFor={`${id}-phone`}>
        휴대폰 번호<Req />
      </label>
      <div className="member-form__addon">
        <input
          className="board-form__input"
          type="tel"
          id={`${id}-phone`}
          placeholder="숫자만 입력해 주세요."
          inputMode="numeric"
          autoComplete="tel"
          maxLength={13}
          value={phone}
          readOnly={verified}
          aria-invalid={invalid || undefined}
          onChange={(e) => onPhoneChange(e.target.value)}
        />
        {verified ? (
          <button className="member-form__button member-form__button--line" type="button" onClick={pv.changeNumber}>
            번호 변경
          </button>
        ) : (
          <button
            className="member-form__button member-form__button--line"
            type="button"
            disabled={!pv.canSend}
            onClick={pv.sendCode}
          >
            {pv.sendLabel}
          </button>
        )}
      </div>
      {!verified && (
        <div className="member-form__addon">
          <div className="member-form__timer-field">
            <label className="sr-only" htmlFor={`${id}-code`}>
              인증번호 6자리
            </label>
            <input
              className="board-form__input"
              type="text"
              id={`${id}-code`}
              inputMode="numeric"
              maxLength={6}
              placeholder="인증번호 6자리"
              autoComplete="one-time-code"
              value={pv.code}
              disabled={!pv.sent || pv.expired}
              onChange={(e) => pv.setCode(e.target.value)}
            />
            {pv.timer && (
              <span className="member-form__timer" aria-label="남은 시간">
                {pv.timer}
              </span>
            )}
          </div>
          <button className="member-form__button" type="button" disabled={!pv.canVerify} onClick={pv.verifyCode}>
            확인
          </button>
        </div>
      )}
      <p className={`member-form__result${verified ? ' member-form__result--ok' : ''}`} role="status" aria-live="polite">
        {result}
      </p>
      {pv.debugCode && <p className="member-form__demo">개발용 인증번호: {pv.debugCode}</p>}
    </div>
  )
}

interface AgreeProps<T extends FieldValues> {
  id: string
  register: UseFormRegister<T>
  all: { checked: boolean; toggle: (on: boolean) => void }
}

/** 약관 동의 묶음 + 전체 동의 (목업 member-agree.html) */
export const MemberAgree = <T extends FieldValues>({ id, register, all }: AgreeProps<T>) => (
  <fieldset className="member-form__agree">
    <legend className="sr-only">약관 동의</legend>
    <div className="board-form__row board-form__row--check member-form__agree-all">
      <input
        className="board-form__checkbox"
        type="checkbox"
        id={`${id}-ag-all`}
        checked={all.checked}
        onChange={(e) => all.toggle(e.target.checked)}
      />
      <label className="board-form__check" htmlFor={`${id}-ag-all`}>
        약관에 모두 동의합니다.
      </label>
    </div>
    <div className="board-form__row board-form__row--check">
      <input className="board-form__checkbox" type="checkbox" id={`${id}-ag-terms`} {...register('terms_agree' as never)} />
      <label className="board-form__check" htmlFor={`${id}-ag-terms`}>
        이용약관 동의 <span className="member-form__must">(필수)</span>
      </label>
    </div>
    <div className="board-form__row board-form__row--check">
      <input className="board-form__checkbox" type="checkbox" id={`${id}-ag-privacy`} {...register('privacy_agree' as never)} />
      <label className="board-form__check" htmlFor={`${id}-ag-privacy`}>
        개인정보처리방침 동의 <span className="member-form__must">(필수)</span>
      </label>
    </div>
    <div className="board-form__row board-form__row--check">
      <input className="board-form__checkbox" type="checkbox" id={`${id}-ag-mkt`} {...register('marketing_agree' as never)} />
      <label className="board-form__check" htmlFor={`${id}-ag-mkt`}>
        마케팅 · 이벤트 알림 수신 <span className="member-form__optional">(선택)</span>
      </label>
    </div>
    <p className="member-form__agree-note">
      ※ 예약 확정 · 변경 안내는 동의 여부와 관계없이 문자로 보내드립니다. 마케팅 수신은 마이페이지에서 언제든 바꿀 수
      있어요.
    </p>
  </fieldset>
)

/** 카카오 · 네이버 (목업 member-sns.html) — 기능 플래그 MEMBER_SOCIAL_LOGIN OFF 면 숨김 */
export const MemberSns = ({
  slug,
  action,
  returnTo,
}: {
  slug: string
  action: '로그인' | '시작하기'
  returnTo: string
}) => {
  const options = useAuthOptions(slug)
  const [error, setError] = useState<string | null>(null)
  if (!options.data?.social_login) return null

  const start = async (provider: SocialProvider) => {
    setError(null)
    try {
      window.location.assign(await fetchSocialAuthorizeUrl(slug, provider, returnTo))
    } catch (err) {
      setError(socialErrorMessage(err))
    }
  }
  const has = (p: SocialProvider) => options.data?.providers.includes(p)
  return (
    <div className="member-form__sns">
      {has('KAKAO') && (
        <a
          className="member-form__sns-button member-form__sns-button--kakao"
          href={`/${slug}/member/login`}
          onClick={(e) => {
            e.preventDefault()
            void start('KAKAO')
          }}
        >
          <i className="ri-kakao-talk-fill member-form__sns-icon" aria-hidden="true" />
          카카오로 {action}
        </a>
      )}
      {has('NAVER') && (
        <a
          className="member-form__sns-button member-form__sns-button--naver"
          href={`/${slug}/member/login`}
          onClick={(e) => {
            e.preventDefault()
            void start('NAVER')
          }}
        >
          <span className="member-form__sns-icon member-form__sns-icon--naver" aria-hidden="true">
            N
          </span>
          네이버로 {action}
        </a>
      )}
      {error && <p className="member-form__result" role="alert">{error}</p>}
    </div>
  )
}

/** 이메일 찾기 | 비밀번호 찾기 탭 (목업 find-tabs.html) */
export const FindTabs = ({ slug, current }: { slug: string; current: 'email' | 'pw' }) => (
  <nav className="member-form__tabs" aria-label="이메일 · 비밀번호 찾기">
    <a
      className="member-form__tab"
      href={`/${slug}/member/find-email`}
      aria-current={current === 'email' ? 'page' : undefined}
    >
      이메일 찾기
    </a>
    <a
      className="member-form__tab"
      href={`/${slug}/member/find-password`}
      aria-current={current === 'pw' ? 'page' : undefined}
    >
      비밀번호 찾기
    </a>
  </nav>
)

/** .board-form.member-form 섹션 틀 */
export const MemberSection = ({ labelledBy, children }: { labelledBy: string; children: ReactNode }) => (
  <section className="board-form member-form" aria-labelledby={labelledBy}>
    <div className="page-container">{children}</div>
  </section>
)
