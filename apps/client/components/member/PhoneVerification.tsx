'use client'

import { useState } from 'react'
import { formatSeconds, useCountdown } from '@/hooks/useCountdown'
import { useSendPhoneCode, useVerifyPhoneCode } from '@/hooks/member/useMemberAuth'
import type { VerificationPurpose } from '@/lib/memberAuth'
import { PHONE_RE } from '@/lib/memberSchemas'
import { Field, TextInput, secondaryButtonClass } from './fields'

interface PhoneVerificationProps {
  slug: string
  purpose: VerificationPurpose
  phone: string
  onPhoneChange: (phone: string) => void
  verified: boolean
  onVerified: (verificationId: string) => void
  /** 번호를 바꾸면 이전 인증은 무효 */
  onReset: () => void
  phoneError?: string
  verifyError?: string
}

/**
 * 휴대폰 인증 (기획서 16.3 · 16.5 · 16.6, T-109 API)
 * 발송 → 3분 타이머 → 확인. 재발송 60초 간격 (서버 resend_after_seconds).
 */
const PhoneVerification = ({
  slug,
  purpose,
  phone,
  onPhoneChange,
  verified,
  onVerified,
  onReset,
  phoneError,
  verifyError,
}: PhoneVerificationProps) => {
  const send = useSendPhoneCode(slug, purpose)
  const verify = useVerifyPhoneCode(slug)
  const ttl = useCountdown()
  const cooldown = useCountdown()
  const [verificationId, setVerificationId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [debugCode, setDebugCode] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const phoneValid = PHONE_RE.test(phone.trim())
  const expired = verificationId !== null && !verified && !ttl.active

  const handleSend = () => {
    setMessage(null)
    send.mutate(phone.trim(), {
      onSuccess: (result) => {
        setVerificationId(result.verification_id)
        setCode('')
        setDebugCode(result.debug_code)
        const seconds = Math.round((Date.parse(result.expires_at) - Date.now()) / 1000)
        ttl.start(seconds > 0 ? seconds : 180)
        cooldown.start(result.resend_after_seconds)
      },
      onError: (error) => {
        setMessage(error.message)
        if (error.retryAfterSeconds) cooldown.start(error.retryAfterSeconds)
      },
    })
  }

  const handleVerify = () => {
    if (!verificationId) return
    setMessage(null)
    verify.mutate(
      { verificationId, code },
      {
        onSuccess: () => {
          ttl.start(0)
          onVerified(verificationId)
        },
        onError: (error) => {
          const remaining = error.details[0]?.remaining_attempts
          setMessage(
            typeof remaining === 'number'
              ? `${error.message} (남은 시도 ${remaining}회)`
              : error.message,
          )
        },
      },
    )
  }

  const handleChangeNumber = () => {
    setVerificationId(null)
    setCode('')
    setDebugCode(null)
    ttl.start(0)
    onReset()
  }

  const sendLabel = cooldown.active
    ? `재발송 (${cooldown.remaining}초)`
    : verificationId
      ? '재발송'
      : '인증번호 받기'

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
            <button type="button" className={secondaryButtonClass} onClick={handleChangeNumber}>
              번호 변경
            </button>
          ) : (
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={!phoneValid || cooldown.active || send.isPending}
              onClick={handleSend}
            >
              {sendLabel}
            </button>
          )}
        </div>
      </Field>

      {verificationId && !verified && (
        <div className="flex gap-2">
          <div className="relative w-full">
            <TextInput
              id="phone-code"
              aria-label="인증번호 6자리"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="인증번호 6자리"
              value={code}
              disabled={expired}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            {ttl.active && (
              <span
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-red-500"
                aria-label="남은 시간"
              >
                {formatSeconds(ttl.remaining)}
              </span>
            )}
          </div>
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={code.length !== 6 || expired || verify.isPending}
            onClick={handleVerify}
          >
            확인
          </button>
        </div>
      )}

      {verified && <p className="text-xs text-emerald-600">✓ 인증 완료</p>}
      {expired && (
        <p role="alert" className="text-xs text-red-600">
          인증번호가 만료되었습니다. 다시 요청해주세요
        </p>
      )}
      {(message || verifyError) && !verified && (
        <p role="alert" className="text-xs text-red-600">
          {message ?? verifyError}
        </p>
      )}
      {debugCode && !verified && (
        <p className="text-xs text-amber-600">개발용 인증번호: {debugCode}</p>
      )}
    </div>
  )
}

export default PhoneVerification
