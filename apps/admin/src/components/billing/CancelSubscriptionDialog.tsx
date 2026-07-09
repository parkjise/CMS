import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button, Modal, toast } from '@cms/ui'
import { useCancelSubscription } from '@/hooks/useBilling'

interface Props {
  open: boolean
  onClose: () => void
}

const REASONS = [
  '가격이 비쌈',
  '원하는 기능 없음',
  '사업 종료',
  '다른 서비스로 이동',
  '기타',
]

export function CancelSubscriptionDialog({ open, onClose }: Props) {
  const [reason, setReason] = useState('')
  const cancel = useCancelSubscription()

  const handleConfirm = async () => {
    try {
      await cancel.mutateAsync(reason || undefined)
      toast.success('구독 해지가 접수되었습니다.')
      onClose()
    } catch {
      toast.error('해지 처리에 실패했습니다.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="구독 해지">
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">
            해지 사유를 알려주세요 (선택)
          </p>
          <div className="space-y-1.5">
            {REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="cancel-reason"
                  checked={reason === r}
                  onChange={() => setReason(r)}
                />
                {r}
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div>
            <p>해지해도 <b>현재 결제 기간까지는 계속 이용</b>하실 수 있습니다.</p>
            <p className="mt-1">
              이후 데이터는 <b>30일간 보관</b>되며, 그 후 완전히 삭제됩니다.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            해지 취소
          </Button>
          <Button variant="danger" onClick={handleConfirm} loading={cancel.isPending}>
            해지 확인
          </Button>
        </div>
      </div>
    </Modal>
  )
}
