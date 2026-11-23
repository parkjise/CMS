import { useState } from 'react'
import { Button, Input, Modal, toast } from '@cms/ui'
import { usePurgeBoard, usePurgePreview } from '@/hooks/useBoards'
import { pickErrorMessage } from '@/lib/errorMessages'

interface PurgeBoardDialogProps {
  /** 지울 게시판 — 없으면 닫힘 */
  board: { id: string; name: string } | null
  onClose: () => void
}

/**
 * 휴지통 게시판 영구 삭제 확인 (T-228, QA 2.3-3) — 함께 지워지는 수를 보여 주고,
 * 게시판 이름을 똑같이 입력해야 [영구 삭제]가 켜진다.
 */
export function PurgeBoardDialog({ board, onClose }: PurgeBoardDialogProps) {
  const purgeBoard = usePurgeBoard()
  const preview = usePurgePreview(board?.id ?? null)
  const [typed, setTyped] = useState('')
  const matches = board !== null && typed.trim() === board.name

  const close = () => {
    if (purgeBoard.isPending) return
    setTyped('')
    onClose()
  }

  const purge = async () => {
    if (!board || !matches) return
    try {
      await purgeBoard.mutateAsync(board.id)
      toast.success('게시판을 영구 삭제했습니다.')
      setTyped('')
      onClose()
    } catch (error) {
      toast.error(pickErrorMessage(error, '영구 삭제하지 못했습니다.'))
    }
  }

  const counts = preview.data
  return (
    <Modal open={board !== null} onClose={close} title="게시판 영구 삭제" size="md">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void purge()
        }}
      >
        <p className="text-sm text-slate-600">
          <strong className="text-slate-900">'{board?.name}'</strong> 게시판을 영구 삭제하면 되돌릴
          수 없어요. 아래 내용도 함께 지워집니다.
        </p>
        {preview.isLoading && <div className="h-16 animate-pulse rounded-lg bg-slate-100" />}
        {preview.isError && (
          <p className="text-sm text-slate-500">
            함께 지워지는 수를 불러오지 못했어요. 글 · 필드 · 카테고리 · 첨부가 모두 지워집니다.
          </p>
        )}
        {counts && (
          <ul
            aria-label="함께 지워지는 것"
            className="grid grid-cols-2 gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-800 sm:grid-cols-4"
          >
            <li>글 {counts.posts.toLocaleString()}개</li>
            <li>필드 {counts.fields.toLocaleString()}개</li>
            <li>카테고리 {counts.categories.toLocaleString()}개</li>
            <li>첨부 {counts.attachments.toLocaleString()}개</li>
          </ul>
        )}
        <Input
          label="확인을 위해 게시판 이름을 입력해 주세요"
          placeholder={board?.name}
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" disabled={purgeBoard.isPending} onClick={close}>
            취소
          </Button>
          <Button type="submit" variant="danger" loading={purgeBoard.isPending} disabled={!matches}>
            영구 삭제
          </Button>
        </div>
      </form>
    </Modal>
  )
}
