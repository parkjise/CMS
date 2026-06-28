import { Button, Modal } from '@cms/ui'
import type { TemplateItem } from '@/hooks/useTemplates'

interface ApplyConfirmDialogProps {
  template: TemplateItem | null
  isApplying: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ApplyConfirmDialog({
  template,
  isApplying,
  onConfirm,
  onClose,
}: ApplyConfirmDialogProps) {
  return (
    <Modal
      open={template !== null}
      onClose={onClose}
      title="이 템플릿을 적용할까요?"
      size="sm"
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-700">
          <span className="font-semibold">{template?.name}</span> 템플릿을
          적용합니다.
        </p>
        <ul className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          <li>· 디자인(색상·폰트·레이아웃)만 바뀝니다.</li>
          <li>· 작성하신 텍스트·이미지 콘텐츠는 그대로 유지됩니다.</li>
          <li>· 적용 후 언제든 이전 상태로 롤백할 수 있습니다.</li>
        </ul>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={isApplying}>
            취소
          </Button>
          <Button onClick={onConfirm} disabled={isApplying}>
            {isApplying ? '적용 중…' : '적용하기'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
