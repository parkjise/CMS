import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Button, Input, toast } from '@cms/ui'
import { FormField } from '@/components/content/forms/FormField'
import {
  type PhoneCodeSent,
  useSendAlertPhoneCode,
  useVerifyAlertPhoneCode,
} from '@/hooks/useNotificationSettings'
import { pickErrorMessage } from '@/lib/errorMessages'
import { type PhoneVerified, phoneDigits } from '@/lib/phone'

interface AlertPhoneFieldProps {
  phone: string
  onPhoneChange: (phone: string) => void
  /** 저장된 번호 · 인증 시각 */
  savedPhone: string | null
  savedVerifiedAt: string | null | undefined
  verified: PhoneVerified | null
  onVerified: (verified: PhoneVerified) => void
}

/** 알림 받을 번호 + [인증] (T-204, AD-03) — 문자로 받은 6자리를 확인해야 저장된다. */
export function AlertPhoneField({
  phone,
  onPhoneChange,
  savedPhone,
  savedVerifiedAt,
  verified,
  onVerified,
}: AlertPhoneFieldProps) {
  const sendMutation = useSendAlertPhoneCode()
  const verifyMutation = useVerifyAlertPhoneCode()
  const [sent, setSent] = useState<(PhoneCodeSent & { digits: string }) | null>(null)
  const [code, setCode] = useState('')
  const [resendIn, setResendIn] = useState(0)

  const digits = phoneDigits(phone)
  const isSaved = digits !== '' && digits === phoneDigits(savedPhone)
  const isVerified =
    (verified !== null && verified.digits === digits) || (isSaved && Boolean(savedVerifiedAt))
  // 입력 중인 번호와 다른 번호로 받은 인증번호는 숨긴다
  const pending = sent && sent.digits === digits && !isVerified ? sent : null

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = window.setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [resendIn])

  const handleSend = async () => {
    try {
      const result = await sendMutation.mutateAsync(phone)
      setSent({ ...result, digits })
      setCode('')
      setResendIn(result.resend_after_seconds)
      toast.success('인증번호를 보냈습니다. 3분 안에 입력해주세요.')
    } catch (e) {
      toast.error(pickErrorMessage(e, '인증번호를 보내지 못했습니다.'))
    }
  }

  const handleVerify = async () => {
    if (!pending) return
    try {
      await verifyMutation.mutateAsync({
        verification_id: pending.verification_id,
        code,
      })
      onVerified({ digits, verificationId: pending.verification_id })
      setSent(null)
      setCode('')
      toast.success('번호를 인증했습니다. [알림 설정 저장]을 눌러 적용하세요.')
    } catch (e) {
      toast.error(pickErrorMessage(e, '인증번호를 확인하지 못했습니다.'))
    }
  }

  const status = !digits ? null : isVerified ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
      <CheckCircle2 className="h-3.5 w-3.5" />
      인증됨
    </span>
  ) : (
    <span className="text-xs font-medium text-amber-600">인증 필요</span>
  )

  return (
    <FormField
      label="휴대폰 번호"
      htmlFor="alert-phone"
      hint="새 문의 알림을 받을 번호예요. 문자로 받은 인증번호를 확인해야 저장돼요."
      trailing={status}
    >
      <div className="flex gap-2">
        <Input
          id="alert-phone"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          placeholder="010-1234-5678"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={handleSend}
          disabled={
            !digits || isVerified || sendMutation.isPending || (pending !== null && resendIn > 0)
          }
          className="shrink-0"
        >
          {pending ? (resendIn > 0 ? `재전송 ${resendIn}초` : '재전송') : '인증'}
        </Button>
      </div>

      {pending && (
        <div className="mt-2 space-y-1">
          <div className="flex gap-2">
            <Input
              aria-label="인증번호"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              placeholder="인증번호 6자리"
            />
            <Button
              type="button"
              onClick={handleVerify}
              disabled={code.length !== 6 || verifyMutation.isPending}
              className="shrink-0"
            >
              확인
            </Button>
          </div>
          {pending.debug_code && (
            <p className="text-xs text-slate-500">
              개발용 인증번호: {pending.debug_code} (테스트 모드 — 실제 문자는 가지 않아요)
            </p>
          )}
        </div>
      )}
    </FormField>
  )
}
