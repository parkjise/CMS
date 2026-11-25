import { useNavigate } from 'react-router'
import type { Board } from '@cms/types'
import { Button, Input, Textarea, Toggle, toast } from '@cms/ui'
import { ReadOnlyFieldset } from '@/components/layout/ReadOnlyFieldset'
import { useCanEdit } from '@/hooks/useCanEdit'
import { BoardUsageCard } from '@/components/boards/BoardUsageCard'
import { useBoardUsage, useDeleteBoard, useDuplicateBoard } from '@/hooks/useBoards'
import type { SetupDraft } from '@/lib/boardSetup'
import { usageWarning } from '@/lib/boardUsage'
import { pickErrorMessage } from '@/lib/errorMessages'

type Basic = SetupDraft['basic']

interface BoardBasicFieldsProps {
  board: Board
  value: Basic
  onChange: (change: Partial<Basic>) => void
  nameError?: string
  /** 휴지통으로 옮긴 뒤 — 저장할 것이 없으니 나가기 확인 없이 목록으로 */
  onRemoved: () => void
}

/**
 * 기본 정보 구역 (BM-03) — 유형 · 정렬은 게시판 디자인, 주소 · 사용 여부는 홈페이지 연결.
 * 저장은 게시판 설정 아래 저장 막대에서 한 번에 (T-228). 복제 · 휴지통은 바로 실행.
 */
export function BoardBasicFields({ board, value, onChange, nameError, onRemoved }: BoardBasicFieldsProps) {
  const navigate = useNavigate()
  const canEdit = useCanEdit()
  const duplicateBoard = useDuplicateBoard()
  const deleteBoard = useDeleteBoard()
  const isSystem = board.system_key !== null
  // 게시판 연결 섹션에 고를 수 있는 게시판 — 새 게시판 · 공지 (T-243)
  const connectable = board.system_key === null || board.system_key === 'notice'
  const usage = useBoardUsage(board.id, { enabled: connectable }).data

  const duplicate = async () => {
    try {
      const copy = await duplicateBoard.mutateAsync(board.id)
      toast.success('설정과 칸을 복제했습니다. 글은 복제되지 않습니다.')
      navigate(`/admin/boards/${copy.id}/settings`)
    } catch (error) {
      toast.error(pickErrorMessage(error, '복제하지 못했습니다.'))
    }
  }

  const remove = async () => {
    const posts = board.post_count > 0 ? `글 ${board.post_count.toLocaleString()}개도 함께 보이지 않게 되고, ` : ''
    const message = `'${board.name}' 을(를) 휴지통으로 옮길까요? ${posts}홈페이지 메뉴와 주소에서 빠집니다.${usageWarning(usage)}`
    if (!window.confirm(message)) return
    try {
      await deleteBoard.mutateAsync(board.id)
      toast.success('휴지통으로 옮겼습니다.')
      onRemoved()
    } catch (error) {
      toast.error(pickErrorMessage(error, '삭제하지 못했습니다.'))
    }
  }

  return (
    <div className="space-y-5">
      <ReadOnlyFieldset>
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <Input
            id="board-setup-name"
            label="게시판 이름"
            required
            maxLength={100}
            value={value.name}
            error={nameError}
            onChange={(e) => onChange({ name: e.target.value })}
          />
          <Textarea
            label="설명 (선택)"
            rows={2}
            maxLength={200}
            value={value.description}
            onChange={(e) => onChange({ description: e.target.value })}
          />
        </div>

        {!isSystem && (
          <div className="mt-5 space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">검색 노출</h3>
            <Toggle
              label="검색 결과에 표시"
              description="끄면 이 게시판과 글이 검색 대상과 사이트맵에서 빠집니다. 주소로는 그대로 열립니다."
              checked={value.seo_index}
              onChange={(e) => onChange({ seo_index: e.target.checked })}
            />
            <Input
              label="검색 제목 (선택)"
              maxLength={60}
              placeholder={value.name || board.name}
              value={value.seo_title}
              onChange={(e) => onChange({ seo_title: e.target.value })}
            />
            <Textarea
              label="검색 설명 (선택)"
              rows={2}
              maxLength={160}
              value={value.seo_description}
              onChange={(e) => onChange({ seo_description: e.target.value })}
            />
          </div>
        )}
      </ReadOnlyFieldset>

      {connectable && <BoardUsageCard boardId={board.id} />}

      {canEdit && (
        <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" loading={duplicateBoard.isPending} onClick={duplicate}>
            복제
          </Button>
          {!isSystem && (
            <Button type="button" variant="ghost" loading={deleteBoard.isPending} onClick={remove}>
              휴지통으로
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
