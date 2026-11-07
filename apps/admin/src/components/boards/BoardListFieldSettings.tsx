import { Link } from 'react-router'
import { Toggle, toast } from '@cms/ui'
import { useBoardFields, useUpdateField } from '@/hooks/useBoardFields'
import { useCanEdit } from '@/hooks/useCanEdit'
import { pickErrorMessage } from '@/lib/errorMessages'

interface BoardListFieldSettingsProps {
  boardId: string
}

/** 필드별 즉시 저장 — 디자인 폼의 저장 버튼과 독립된 기존 필드 설정이다. */
export const BoardListFieldSettings = ({ boardId }: BoardListFieldSettingsProps) => {
  const canEdit = useCanEdit()
  const fieldsQuery = useBoardFields(boardId)
  const updateField = useUpdateField(boardId)
  const fields = (fieldsQuery.data ?? []).filter((field) => !field.deleted_at)
  const change = (id: string, checked: boolean) => {
    updateField.mutate(
      { id, payload: { show_in_list: checked } },
      {
        onSuccess: () => toast.success('목록 표시를 저장했습니다.'),
        onError: (error) =>
          toast.error(pickErrorMessage(error, '목록 표시를 저장하지 못했습니다.')),
      }
    )
  }
  return (
    <section className="mb-5 space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">목록에 표시할 추가 정보</h2>
      <p className="text-xs text-slate-500">
        각 칸은 바꾸는 즉시 저장됩니다. 관리자 글 목록과 전체 글에도 적용됩니다. 홈페이지에는
        홈페이지 표시를 켠 칸만 제목 아래에 나옵니다.
      </p>
      {fieldsQuery.isPending ? (
        <p className="text-sm text-slate-500">칸 정보를 불러오는 중…</p>
      ) : fieldsQuery.isError ? (
        <p className="text-sm text-red-600" role="alert">
          칸 정보를 불러오지 못했습니다.
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => void fieldsQuery.refetch()}
          >
            다시 시도
          </button>
        </p>
      ) : fields.length === 0 ? (
        <p className="text-sm text-slate-500">추가한 칸이 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {fields.map((field) => (
            <Toggle
              key={field.id}
              label={field.label}
              description={
                field.is_visible ? undefined : '홈페이지 비표시 · 관리자 목록에만 표시됩니다.'
              }
              checked={field.show_in_list}
              disabled={!canEdit || updateField.isPending}
              onChange={(event) => change(field.id, event.target.checked)}
            />
          ))}
        </div>
      )}
      <Link
        to={`/admin/boards/${boardId}/fields`}
        className="inline-block text-sm text-blue-600 hover:underline"
      >
        칸 이름 · 순서 · 홈페이지 표시 설정
      </Link>
    </section>
  )
}
