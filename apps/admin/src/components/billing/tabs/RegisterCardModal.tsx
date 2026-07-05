import { useState } from 'react'
import { Button, Input, Modal, toast } from '@cms/ui'
import { useRegisterCard } from '@/hooks/useBilling'

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * 카드 등록 모달.
 *
 * 프로덕션에서는 토스페이먼츠 결제 위젯이 authKey/customerKey를 공급한다.
 * 여기서는 백엔드 register-card를 직접 호출한다(백엔드 PAYMENT_MODE=test stub 연동).
 * 위젯 연동 시 아래 auth_key 취득 부분만 위젯 콜백으로 교체하면 된다.
 */
export function RegisterCardModal({ open, onClose }: Props) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const register = useRegisterCard()

  const handleSubmit = async () => {
    try {
      await register.mutateAsync({
        auth_key: `authkey_${Date.now()}`,
        customer_key: `cust_${crypto.randomUUID?.() ?? Date.now()}`,
        billing_email: email || undefined,
        billing_name: name || undefined,
      })
      toast.success('결제 수단이 등록되었습니다.')
      onClose()
    } catch {
      toast.error('카드 등록에 실패했습니다.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="결제 수단 등록">
      <div className="space-y-3">
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          토스페이먼츠 안전 결제로 카드를 등록합니다. 카드 정보는 당사 서버에
          저장되지 않습니다.
        </p>
        <Input
          label="영수증 수신 이메일"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="카드 소유자명"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button onClick={handleSubmit} loading={register.isPending}>
            카드 등록
          </Button>
        </div>
      </div>
    </Modal>
  )
}
