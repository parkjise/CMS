'use client'

/**
 * hospital-a 회원 인증 화면 6종 — 목업 components/sub/{login · join · join-social · find-email ·
 * find-pw · reset-pw}-form.html 마크업 그대로 (T-124).
 * 로직은 공통 화면과 같은 훅(hooks/member/useMemberForms) — 화면만 템플릿별.
 */
import { useLayoutEffect, useRef } from 'react'
import {
  useFindEmailForm,
  useFindPasswordForm,
  useJoinForm,
  useJoinSocialForm,
  useLoginForm,
  useResetPasswordForm,
} from '@/hooks/member/useMemberForms'
import { providerLabel } from '@/lib/memberSocial'
import {
  FindTabs,
  MemberAgree,
  MemberSection,
  MemberSns,
  PasswordInput,
  PasswordRules,
  PhoneVerify,
  Req,
  StatusLine,
  firstError,
} from './parts'

interface ScreenProps {
  slug: string
  next?: string | null
}

const href = (slug: string, page: string) => `/${slug}/member/${page}`

/** 단계가 바뀌면 새 패널로 포커스 (목업 member-form.js) */
const useFocusOnChange = (key: string) => {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    ref.current?.focus()
  }, [key])
  return ref
}

// ── 로그인 ──────────────────────────────────────────────────────────────────

export const LoginScreen = ({ slug, next, brandName }: ScreenProps & { brandName: string }) => {
  const login = useLoginForm(slug, next)
  const {
    register,
    formState: { errors },
  } = login.form
  const status = login.locked
    ? null
    : (firstError(errors, ['email', 'password']) ?? login.formError)

  return (
    <MemberSection labelledBy="login-title">
      <form className="board-form__form" noValidate onSubmit={login.onSubmit}>
        <div className="board-form__panel board-form__panel--narrow">
          <p className="member-form__logo" lang="en" aria-hidden="true">
            {brandName}
          </p>
          <h2 className="member-form__title" id="login-title">
            {brandName}에 오신 것을 환영합니다.
          </h2>

          <div className="board-form__list">
            <div className="board-form__row">
              <label className="board-form__label" htmlFor="lg-email">
                이메일
              </label>
              <input
                className="board-form__input"
                type="email"
                id="lg-email"
                placeholder="example@email.com"
                autoComplete="email"
                aria-invalid={errors.email ? true : undefined}
                {...register('email')}
              />
            </div>
            <div className="board-form__row">
              <label className="board-form__label" htmlFor="lg-pw">
                비밀번호
              </label>
              <PasswordInput
                id="lg-pw"
                placeholder="비밀번호를 입력해 주세요."
                autoComplete="current-password"
                invalid={Boolean(errors.password)}
                {...register('password')}
              />
            </div>
            <div className="board-form__row board-form__row--check">
              <input className="board-form__checkbox" type="checkbox" id="lg-keep" {...register('remember_me')} />
              <label className="board-form__check" htmlFor="lg-keep">
                로그인 상태 유지
              </label>
            </div>
          </div>

          {login.locked ? (
            <p className="board-form__status" role="status" aria-live="polite">
              30분 후에 다시 시도해주세요{' '}
              <span aria-label="남은 잠금 시간">
                ({Math.floor(login.lockRemaining / 60)}:{String(login.lockRemaining % 60).padStart(2, '0')})
              </span>
            </p>
          ) : (
            <StatusLine message={status} />
          )}

          <button className="member-form__submit" type="submit" disabled={login.locked || login.pending}>
            로그인
          </button>

          <p className="member-form__links">
            <a href={href(slug, 'find-email')}>이메일 찾기</a>
            <a href={href(slug, 'find-password')}>비밀번호 찾기</a>
          </p>
          <p className="member-form__switch">
            아직 회원이 아니신가요?{' '}
            <a href={`${href(slug, 'join')}${next ? `?next=${encodeURIComponent(next)}` : ''}`}>회원가입</a>
          </p>
          <MemberSns slug={slug} action="로그인" returnTo={login.target} />
        </div>
      </form>
    </MemberSection>
  )
}

// ── 회원가입 ────────────────────────────────────────────────────────────────

export const JoinScreen = ({ slug, next }: ScreenProps) => {
  const join = useJoinForm(slug, next)
  const {
    register,
    formState: { errors },
  } = join.form
  const status =
    firstError(errors, [
      'name',
      'email',
      'password',
      'password_confirm',
      'phone',
      'phone_verification_id',
      'terms_agree',
    ]) ?? join.formError
  const emailResult =
    join.emailAvailable === null
      ? null
      : join.emailAvailable
        ? '사용 가능한 이메일입니다.'
        : '이미 사용 중인 이메일입니다'

  return (
    <MemberSection labelledBy="join-title">
      <form className="board-form__form" noValidate onSubmit={join.onSubmit}>
        <div className="board-form__panel board-form__panel--narrow">
          <h2 className="member-form__heading" id="join-title">
            회원가입
          </h2>

          <p className="board-form__note">
            <Req />는 필수 입력 항목입니다.
          </p>
          <div className="board-form__list">
            <div className="board-form__row">
              <label className="board-form__label" htmlFor="jn-name">
                이름<Req />
              </label>
              <input
                className="board-form__input"
                type="text"
                id="jn-name"
                placeholder="홍길동"
                autoComplete="name"
                maxLength={20}
                aria-invalid={errors.name ? true : undefined}
                {...register('name')}
              />
            </div>

            <div className="board-form__row">
              <label className="board-form__label" htmlFor="jn-email">
                이메일<Req />
              </label>
              <input
                className="board-form__input"
                type="email"
                id="jn-email"
                placeholder="example@email.com"
                autoComplete="email"
                aria-invalid={errors.email ? true : undefined}
                {...register('email')}
              />
              <p
                className={`member-form__result${join.emailAvailable ? ' member-form__result--ok' : ''}`}
                role="status"
                aria-live="polite"
              >
                {emailResult}
              </p>
            </div>

            <div className="board-form__row">
              <label className="board-form__label" htmlFor="jn-pw">
                비밀번호<Req />
              </label>
              <PasswordInput
                id="jn-pw"
                placeholder="영문, 숫자 포함 8자 이상"
                autoComplete="new-password"
                maxLength={20}
                aria-describedby="jn-pw-rules"
                invalid={Boolean(errors.password)}
                {...register('password')}
              />
              <PasswordRules id="jn-pw" value={join.password} />
            </div>

            <div className="board-form__row">
              <label className="board-form__label" htmlFor="jn-pw2">
                비밀번호 확인<Req />
              </label>
              <PasswordInput
                id="jn-pw2"
                placeholder="비밀번호를 한 번 더 입력해 주세요."
                autoComplete="new-password"
                maxLength={20}
                invalid={Boolean(errors.password_confirm)}
                {...register('password_confirm')}
              />
            </div>

            <PhoneVerify
              id="jn"
              slug={slug}
              purpose="REGISTER"
              phone={join.phone.phone}
              onPhoneChange={join.phone.setPhone}
              verified={join.phone.verified}
              onVerified={join.phone.onVerified}
              onReset={join.phone.onReset}
              invalid={Boolean(errors.phone || errors.phone_verification_id)}
            />

            <div className="board-form__row">
              <label className="board-form__label" htmlFor="jn-birth">
                생년월일 <span className="member-form__optional">(선택)</span>
              </label>
              <input
                className="board-form__input"
                type="date"
                id="jn-birth"
                min="1900-01-01"
                autoComplete="bday"
                {...register('birth_date')}
              />
            </div>
          </div>

          <MemberAgree id="jn" register={register} all={join.agreeAll} />

          <StatusLine message={status} />

          <button className="member-form__submit" type="submit" disabled={join.pending}>
            가입하기
          </button>
          <p className="member-form__switch">
            이미 회원이신가요? <a href={href(slug, 'login')}>로그인</a>
          </p>
          {/* 목업 가입 화면엔 없지만 기획서 16.3 간편 가입 — 로그인 화면과 같은 자리 */}
          <MemberSns slug={slug} action="시작하기" returnTo={join.target} />
        </div>
      </form>
    </MemberSection>
  )
}

// ── 소셜 가입 추가 정보 ─────────────────────────────────────────────────────

export const JoinSocialScreen = ({ slug }: ScreenProps) => {
  const social = useJoinSocialForm(slug)
  const {
    register,
    formState: { errors },
  } = social.form
  const signup = social.signup

  if (signup === undefined) return null
  if (signup === null) {
    return (
      <MemberSection labelledBy="join-social-title">
        <div className="board-form__panel board-form__panel--narrow member-form__done">
          <i className="ri-error-warning-line member-form__done-icon member-form__done-icon--muted" aria-hidden="true" />
          <h2 className="member-form__title" id="join-social-title">
            가입 정보가 없거나 만료되었어요
          </h2>
          <p className="member-form__desc" role="alert">
            소셜 로그인을 다시 시도해주세요.
          </p>
          <div className="member-form__buttons">
            <a className="member-form__submit" href={href(slug, 'login')}>
              로그인으로 돌아가기
            </a>
          </div>
        </div>
      </MemberSection>
    )
  }

  const status =
    firstError(errors, ['email', 'phone', 'phone_verification_id', 'terms_agree']) ?? social.formError
  return (
    <MemberSection labelledBy="join-social-title">
      <form className="board-form__form" noValidate onSubmit={social.onSubmit}>
        <div className="board-form__panel board-form__panel--narrow">
          <p className="member-form__badge" aria-hidden="true">
            {signup.provider === 'NAVER' ? (
              <span className="member-form__sns-icon member-form__sns-icon--naver">N</span>
            ) : (
              <i className="ri-kakao-talk-fill" />
            )}
          </p>
          <h2 className="member-form__title" id="join-social-title">
            {providerLabel(signup.provider)} 계정으로 가입을 완료해 주세요.
          </h2>
          <p className="member-form__desc">
            처음 이용하시는 계정이에요. 예약 안내를 받을 휴대폰 번호만 확인하면 끝나요.
          </p>

          <div className="board-form__list member-form__list">
            {signup.emailRequired && (
              <div className="board-form__row">
                <label className="board-form__label" htmlFor="js-email">
                  이메일<Req />
                </label>
                <input
                  className="board-form__input"
                  type="email"
                  id="js-email"
                  placeholder="example@email.com"
                  autoComplete="email"
                  aria-invalid={errors.email ? true : undefined}
                  {...register('email')}
                />
              </div>
            )}
            <PhoneVerify
              id="js"
              slug={slug}
              purpose="REGISTER"
              phone={social.phone.phone}
              onPhoneChange={social.phone.setPhone}
              verified={social.phone.verified}
              onVerified={social.phone.onVerified}
              onReset={social.phone.onReset}
              invalid={Boolean(errors.phone || errors.phone_verification_id)}
            />
          </div>

          <MemberAgree id="js" register={register} all={social.agreeAll} />

          <StatusLine message={status} />

          <button className="member-form__submit" type="submit" disabled={social.pending}>
            가입 완료하기
          </button>
          <p className="member-form__switch">
            <a href={href(slug, 'login')}>다른 방법으로 로그인</a>
          </p>
        </div>
      </form>
    </MemberSection>
  )
}

// ── 이메일 찾기 ─────────────────────────────────────────────────────────────

export const FindEmailScreen = ({ slug }: ScreenProps) => {
  const find = useFindEmailForm(slug)
  const {
    register,
    formState: { errors },
  } = find.form
  const step = find.accounts ? 'found' : find.notFound ? 'none' : 'form'
  const panelRef = useFocusOnChange(step)
  const status = firstError(errors, ['name', 'phone', 'phone_verification_id']) ?? find.formError

  return (
    <MemberSection labelledBy="find-email-title">
      <FindTabs slug={slug} current="email" />

      {step === 'form' && (
        <form className="board-form__form" noValidate onSubmit={find.onSubmit}>
          <div className="board-form__panel board-form__panel--narrow">
            <a className="member-form__back" href={href(slug, 'login')}>
              <i className="ri-arrow-left-line" aria-hidden="true" />
              로그인으로 돌아가기
            </a>
            <h2 className="member-form__heading" id="find-email-title">
              이메일 찾기
            </h2>
            <p className="member-form__desc">가입할 때 등록한 이름과 휴대폰 번호로 찾을 수 있어요.</p>

            <div className="board-form__list">
              <div className="board-form__row">
                <label className="board-form__label" htmlFor="fe-name">
                  이름<Req />
                </label>
                <input
                  className="board-form__input"
                  type="text"
                  id="fe-name"
                  placeholder="홍길동"
                  autoComplete="name"
                  aria-invalid={errors.name ? true : undefined}
                  {...register('name')}
                />
              </div>
              <PhoneVerify
                id="fe"
                slug={slug}
                purpose="FIND_EMAIL"
                phone={find.phone.phone}
                onPhoneChange={find.phone.setPhone}
                verified={find.phone.verified}
                onVerified={find.phone.onVerified}
                onReset={find.phone.onReset}
                invalid={Boolean(errors.phone || errors.phone_verification_id)}
              />
            </div>

            <StatusLine message={status} />

            <button className="member-form__submit" type="submit" disabled={find.pending}>
              이메일 찾기
            </button>
          </div>
        </form>
      )}

      {step === 'found' && (
        <div className="board-form__panel board-form__panel--narrow member-form__done" tabIndex={-1} ref={panelRef}>
          <i className="ri-checkbox-circle-line member-form__done-icon" aria-hidden="true" />
          <h2 className="member-form__title" id="find-email-title">
            이메일을 찾았어요
          </h2>
          <dl className="member-form__found">
            <dt>등록된 이메일</dt>
            {find.accounts?.map((account) => (
              <dd key={account.masked_email}>
                {account.masked_email}
                {account.social_provider ? ` (${providerLabel(account.social_provider)} 가입)` : ''}
              </dd>
            ))}
          </dl>
          <p className="member-form__desc">보안을 위해 일부만 표시합니다.</p>
          <div className="member-form__buttons">
            <a className="member-form__submit" href={href(slug, 'login')}>
              로그인하기
            </a>
            <a className="member-form__line-link" href={href(slug, 'find-password')}>
              비밀번호도 찾기
            </a>
          </div>
        </div>
      )}

      {step === 'none' && (
        <div className="board-form__panel board-form__panel--narrow member-form__done" tabIndex={-1} ref={panelRef}>
          <i className="ri-error-warning-line member-form__done-icon member-form__done-icon--muted" aria-hidden="true" />
          <h2 className="member-form__title" id="find-email-title">
            일치하는 계정이 없어요
          </h2>
          <p className="member-form__desc">
            입력하신 정보와 일치하는 계정을 찾을 수 없습니다.
            <br />
            이름과 휴대폰 번호를 다시 확인해 주세요.
          </p>
          <div className="member-form__buttons">
            <a className="member-form__submit" href={href(slug, 'join')}>
              회원가입 하기
            </a>
            <button className="member-form__line-link" type="button" onClick={find.retry}>
              다시 찾기
            </button>
          </div>
        </div>
      )}
    </MemberSection>
  )
}

// ── 비밀번호 찾기 ───────────────────────────────────────────────────────────

export const FindPasswordScreen = ({ slug }: ScreenProps) => {
  const find = useFindPasswordForm(slug)
  const {
    register,
    formState: { errors },
  } = find.form
  const panelRef = useFocusOnChange(find.sent ? 'sent' : 'form')
  const status = firstError(errors, ['email', 'phone', 'phone_verification_id']) ?? find.formError

  return (
    <MemberSection labelledBy="find-pw-title">
      <FindTabs slug={slug} current="pw" />

      {find.sent ? (
        <div className="board-form__panel board-form__panel--narrow member-form__done" tabIndex={-1} ref={panelRef}>
          <i className="ri-mail-send-line member-form__done-icon" aria-hidden="true" />
          <h2 className="member-form__title" id="find-pw-title">
            이메일을 확인해 주세요
          </h2>
          <p className="member-form__desc">
            <strong>{find.sent.masked_email}</strong> 으로
            <br />
            비밀번호 재설정 링크를 보냈어요. 링크는 <strong>{find.sent.expires_in_minutes}분간</strong> 유효합니다.
          </p>
          <div className="member-form__resend">
            <p>이메일을 받지 못하셨나요? 스팸 메일함을 확인해 보세요.</p>
            <button
              className="member-form__button member-form__button--line"
              type="button"
              disabled={!find.canResend}
              onClick={find.resendLink}
            >
              {find.resendRemaining > 0 ? `재발송하기 (${find.resendRemaining}초)` : '재발송하기'}
            </button>
            <p className="member-form__result" role="status" aria-live="polite">
              {find.formError}
            </p>
          </div>
          <div className="member-form__buttons">
            <a className="member-form__submit" href={href(slug, 'login')}>
              로그인으로 돌아가기
            </a>
          </div>
          {find.sent.debug_reset_url && (
            <p className="member-form__demo">
              개발용 · 메일 속 링크 열기: <a href={find.sent.debug_reset_url}>재설정 화면</a>
            </p>
          )}
        </div>
      ) : (
        <form className="board-form__form" noValidate onSubmit={find.onSubmit}>
          <div className="board-form__panel board-form__panel--narrow">
            <a className="member-form__back" href={href(slug, 'login')}>
              <i className="ri-arrow-left-line" aria-hidden="true" />
              로그인으로 돌아가기
            </a>
            <h2 className="member-form__heading" id="find-pw-title">
              비밀번호 재설정
            </h2>
            <p className="member-form__desc">가입한 이메일과 휴대폰으로 본인 확인 후 새 비밀번호를 설정할 수 있어요.</p>

            <div className="board-form__list">
              <div className="board-form__row">
                <label className="board-form__label" htmlFor="fp-email">
                  이메일<Req />
                </label>
                <input
                  className="board-form__input"
                  type="email"
                  id="fp-email"
                  placeholder="가입한 이메일 주소"
                  autoComplete="email"
                  aria-invalid={errors.email ? true : undefined}
                  {...register('email')}
                />
              </div>
              <PhoneVerify
                id="fp"
                slug={slug}
                purpose="RESET_PW"
                phone={find.phone.phone}
                onPhoneChange={find.phone.setPhone}
                verified={find.phone.verified}
                onVerified={find.phone.onVerified}
                onReset={find.phone.onReset}
                invalid={Boolean(errors.phone || errors.phone_verification_id)}
              />
            </div>

            <StatusLine message={status} />

            <button className="member-form__submit" type="submit" disabled={find.pending}>
              재설정 링크 보내기
            </button>
          </div>
        </form>
      )}
    </MemberSection>
  )
}

// ── 새 비밀번호 설정 ────────────────────────────────────────────────────────

export const ResetPasswordScreen = ({ slug, token }: ScreenProps & { token: string }) => {
  const reset = useResetPasswordForm(slug, token)
  const {
    register,
    formState: { errors },
  } = reset.form
  const panelRef = useFocusOnChange(reset.step)
  const status = firstError(errors, ['password', 'password_confirm']) ?? reset.formError

  return (
    <MemberSection labelledBy="reset-pw-title">
      {reset.step === 'checking' && (
        <div className="board-form__panel board-form__panel--narrow">
          <p className="member-form__desc" id="reset-pw-title">
            링크를 확인하고 있어요…
          </p>
        </div>
      )}

      {reset.step === 'form' && (
        <form className="board-form__form" noValidate onSubmit={reset.onSubmit}>
          <div className="board-form__panel board-form__panel--narrow">
            <h2 className="member-form__heading" id="reset-pw-title">
              새 비밀번호 설정
            </h2>
            <p className="member-form__desc">
              {reset.maskedEmail ? `${reset.maskedEmail} 계정 · ` : ''}이전에 쓰던 비밀번호와 다른 비밀번호를 권장해요.
            </p>

            <div className="board-form__list">
              <div className="board-form__row">
                <label className="board-form__label" htmlFor="rp-pw">
                  새 비밀번호<Req />
                </label>
                <PasswordInput
                  id="rp-pw"
                  placeholder="영문, 숫자 포함 8자 이상"
                  autoComplete="new-password"
                  maxLength={20}
                  aria-describedby="rp-pw-rules"
                  invalid={Boolean(errors.password)}
                  {...register('password')}
                />
                <PasswordRules id="rp-pw" value={reset.password} />
              </div>
              <div className="board-form__row">
                <label className="board-form__label" htmlFor="rp-pw2">
                  새 비밀번호 확인<Req />
                </label>
                <PasswordInput
                  id="rp-pw2"
                  placeholder="새 비밀번호를 한 번 더 입력해 주세요."
                  autoComplete="new-password"
                  maxLength={20}
                  invalid={Boolean(errors.password_confirm)}
                  {...register('password_confirm')}
                />
              </div>
            </div>

            <StatusLine message={status} />

            <button className="member-form__submit" type="submit" disabled={reset.pending}>
              비밀번호 변경하기
            </button>
          </div>
        </form>
      )}

      {reset.step === 'done' && (
        <div className="board-form__panel board-form__panel--narrow member-form__done" tabIndex={-1} ref={panelRef}>
          <i className="ri-checkbox-circle-line member-form__done-icon" aria-hidden="true" />
          <h2 className="member-form__title" id="reset-pw-title">
            비밀번호가 변경되었습니다
          </h2>
          <p className="member-form__desc" role="status">
            {reset.redirectIn}초 후 로그인 페이지로 이동합니다.
          </p>
          <p className="member-form__notice">
            <i className="ri-shield-check-line" aria-hidden="true" />
            가입한 이메일과 휴대폰으로 변경 알림을 보냈어요. 본인이 아니라면 고객센터에 문의해 주세요.
          </p>
          <div className="member-form__buttons">
            <a className="member-form__submit" href={reset.loginHref}>
              지금 로그인하기
            </a>
          </div>
        </div>
      )}

      {reset.step === 'invalid' && (
        <div className="board-form__panel board-form__panel--narrow member-form__done" tabIndex={-1} ref={panelRef}>
          <i className="ri-time-line member-form__done-icon member-form__done-icon--muted" aria-hidden="true" />
          <h2 className="member-form__title" id="reset-pw-title">
            유효하지 않거나 만료된 링크입니다
          </h2>
          <p className="member-form__desc">재설정 링크는 발송 후 30분 동안, 한 번만 사용할 수 있어요.</p>
          <div className="member-form__buttons">
            <a className="member-form__submit" href={href(slug, 'find-password')}>
              비밀번호 찾기 다시 시도
            </a>
          </div>
        </div>
      )}
    </MemberSection>
  )
}
