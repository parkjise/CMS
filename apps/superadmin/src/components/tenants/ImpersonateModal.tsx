import { AlertTriangle } from 'lucide-react'
import { Button, Modal, toast } from '@cms/ui'
import { useImpersonate } from '@/hooks/useTenant'

interface Props {
  open: boolean
  onClose: () => void
  tenantId: string
}

export function ImpersonateModal({ open, onClose, tenantId }: Props) {
  const impersonate = useImpersonate(tenantId)

  const handleConfirm = async () => {
    try {
      const res = await impersonate.mutateAsync()
      if (res.redirect_url) window.open(res.redirect_url, '_blank', 'noopener')
      onClose()
    } catch {
      toast.error('대리 접속에 실패했습니다.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="관리자 페이지로 접속">
      <div className="space-y-4">
        <div className="flex gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p>
            대리 접속 시 이 계정으로 수행하는 <b>모든 행위가 감사 로그에 기록</b>
            됩니다. 계속하시겠습니까?
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button onClick={handleConfirm} loading={impersonate.isPending}>
            새 탭으로 접속
          </Button>
        </div>
      </div>
    </Modal>
  )
}
