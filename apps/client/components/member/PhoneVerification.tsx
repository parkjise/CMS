'use client'

import { usePhoneVerification, type PhoneVerificationArgs } from '@/hooks/member/useMemberForms'
import { Field, TextInput, secondaryButtonClass } from './fields'

interface PhoneVerificationProps extends PhoneVerificationArgs {
  onPhoneChange: (phone: string) => void
  phoneError?: string
  verifyError?: string
}

/**
 * 휴대폰 인증 (기획서 16.3 · 16.5 · 16.6, T-109 API) — 공통 화면
 * 발송 → 3분 타이머 → 확인. 재발송 60초 간격 (로직: usePhoneVerification)
 */
const PhoneVerification = ({ onPhoneChange, phoneError, verifyError, ...args }: PhoneVerificationProps) => {
  const pv = usePhoneVerification(args)
  const { phone, verified } = args

  return (
    <div className="space-y-2">
      <Field id="phone" label="휴대폰 번호" required error={phoneError}>
        <div className="flex gap-2">
          <TextInput
            id="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="010-0000-0000"
            value={phone}
            readOnly={verified}
            invalid={Boolean(phoneError)}
            onChange={(e) => onPhoneChange(e.target.value)}
          />
          {verified ? (
            <button type="button" className={secondaryButtonClass} onClick={pv.changeNumber}>
              번호 변경
            </button>
          ) : (
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={!pv.canSend}
              onClick={pv.sendCode}
            >
              {pv.sendLabel}
            </button>
          )}
        </div>
      </Field>

      {pv.sent && !verified && (
        <div className="flex gap-2">
          <div className="relative w-full">
            <TextInput
              id="phone-code"
              aria-label="인증번호 6자리"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="인증번호 6자리"
              value={pv.code}
              disabled={pv.expired}
              onChange={(e) => pv.setCode(e.target.value)}
            />
            {pv.timer && (
              <span
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-red-500"
                aria-label="남은 시간"
              >
                {pv.timer}
              </span>
            )}
          </div>
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={!pv.canVerify}
            onClick={pv.verifyCode}
          >
            확인
          </button>
        </div>
      )}

      {verified && <p className="text-xs text-emerald-600">✓ 인증 완료</p>}
      {pv.expired && (
        <p role="alert" className="text-xs text-red-600">
          인증번호가 만료되었습니다. 다시 요청해주세요
        </p>
      )}
      {(pv.message || verifyError) && !verified && (
        <p role="alert" className="text-xs text-red-600">
          {pv.message ?? verifyError}
        </p>
      )}
      {pv.debugCode && (
        <p className="text-xs text-amber-600">개발용 인증번호: {pv.debugCode}</p>
      )}
    </div>
  )
}

export default PhoneVerification
