import { useState } from 'react'
import { Send } from 'lucide-react'
import { Button, Input, Toggle, toast } from '@cms/ui'
import { FormField } from '@/components/content/forms/FormField'
import {
  type NotificationSettings,
  useTestNotification,
  useUpdateNotificationSettings,
} from '@/hooks/useNotificationSettings'
import { MonthlyQuotaBar } from './MonthlyQuotaBar'

interface NotificationSettingsCardProps {
  settings: NotificationSettings
}

export function NotificationSettingsCard({
  settings,
}: NotificationSettingsCardProps) {
  const [alimtalk, setAlimtalk] = useState(settings.alimtalk_enabled)
  const [sms, setSms] = useState(settings.sms_enabled)
  const [email, setEmail] = useState(settings.email_enabled)
  const [phone, setPhone] = useState(settings.recipient_phone ?? '')
  const [recipientEmail, setRecipientEmail] = useState(
    settings.recipient_email ?? ''
  )

  const updateMutation = useUpdateNotificationSettings()
  const testMutation = useTestNotification()

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        alimtalk_enabled: alimtalk,
        sms_enabled: sms,
        email_enabled: email,
        recipient_phone: phone || null,
        recipient_email: recipientEmail || null,
      })
      toast.success('알림 설정을 저장했습니다.')
    } catch (e) {
      const detail =
        (e as { response?: { data?: { detail?: unknown } } })?.response?.data
          ?.detail
      toast.error(typeof detail === 'string' ? detail : '저장에 실패했습니다.')
    }
  }

  const handleTest = async () => {
    try {
      const result = await testMutation.mutateAsync()
      if (result.sent) {
        toast.success(result.message)
      } else {
        toast.warning(result.message)
      }
    } catch {
      toast.error('테스트 발송에 실패했습니다.')
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-slate-900">알림 채널</h2>
        <span className="text-xs text-slate-500">
          새 문의 접수 시 자동 발송
        </span>
      </div>

      <div className="mb-5">
        <MonthlyQuotaBar used={settings.monthly_kakao_count} />
      </div>

      <div className="space-y-3">
        <Toggle
          label="카카오 알림톡"
          description="등록된 카카오톡 채널 친구에게 알림톡 발송"
          checked={alimtalk}
          onChange={(e) => setAlimtalk(e.target.checked)}
        />
        <Toggle
          label="SMS (문자)"
          description="알림톡 실패 시 자동 fallback. 별도 비용 발생"
          checked={sms}
          onChange={(e) => setSms(e.target.checked)}
        />
        <Toggle
          label="이메일"
          description="등록된 이메일로 문의 알림 발송"
          checked={email}
          onChange={(e) => setEmail(e.target.checked)}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField label="휴대폰 번호" hint="형식: 010-1234-5678">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="010-1234-5678"
          />
        </FormField>
        <FormField label="이메일 주소">
          <Input
            type="email"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            placeholder="admin@example.com"
          />
        </FormField>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
        <Button
          type="button"
          variant="secondary"
          onClick={handleTest}
          disabled={testMutation.isPending}
        >
          <Send className="h-3.5 w-3.5" />
          {testMutation.isPending ? '발송 중...' : '테스트 발송'}
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={updateMutation.isPending}
        >
          {updateMutation.isPending ? '저장 중...' : '알림 설정 저장'}
        </Button>
      </div>
    </div>
  )
}
