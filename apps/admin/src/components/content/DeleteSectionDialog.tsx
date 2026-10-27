import { Button, Modal, toast } from '@cms/ui'
import { type Section, useDeleteSection } from '@/hooks/useSections'
import { pickErrorMessage } from '@/lib/errorMessages'

interface DeleteSectionDialogProps {
  section: Section | null
  onClose: () => void
}

/** 섹션 삭제 확인 — 홈페이지에서 사라지고 되돌릴 수 없다고 알린다 (T-037-A) */
export function DeleteSectionDialog({ section, onClose }: DeleteSectionDialogProps) {
  const remove = useDeleteSection()

  const handleDelete = () => {
    if (!section) return
    remove.mutate(section.id, {
      onSuccess: () => {
        toast.success(`'${section.label}' 섹션을 삭제했습니다.`)
        onClose()
      },
      onError: (err) => {
        toast.error(pickErrorMessage(err, '섹션을 삭제하지 못했습니다.'))
      },
    })
  }

  return (
    <Modal open={section !== null} onClose={onClose} title="섹션을 삭제할까요?" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-700">
          <span className="font-semibold">{section?.label}</span> 섹션과 그 안의 글 · 사진
          설정이 홈페이지에서 사라집니다. 잠시 안 보이게 하려면 삭제 대신 노출 토글을
          꺼 주세요.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleDelete}
            disabled={remove.isPending}
          >
            {remove.isPending ? '삭제 중...' : '삭제'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
