import { useBoardFields } from '@/hooks/useBoardFields'
import { fieldValueLabel, isEmptyValue } from '@/lib/customFields'

interface PostListFieldsProps {
  boardId: string
  values: Record<string, unknown>
}

/** 전체 글의 칸 값 — 같은 게시판의 행은 기존 필드 쿼리 캐시를 공유한다. */
export const PostListFields = ({ boardId, values }: PostListFieldsProps) => {
  const fieldsQuery = useBoardFields(boardId)
  if (fieldsQuery.isPending) {
    return <p className="mt-1 text-xs text-slate-500">칸 정보를 불러오는 중…</p>
  }
  // 정의를 확인하지 못했으면 내부 키나 원시 값을 대신 보여 주지 않는다.
  if (fieldsQuery.isError) {
    return (
      <p className="mt-1 text-xs text-red-600" role="alert">
        칸 정보를 불러오지 못했습니다.
        <button type="button" className="ml-2 underline" onClick={() => void fieldsQuery.refetch()}>
          다시 시도
        </button>
      </p>
    )
  }
  const fields = (fieldsQuery.data ?? []).filter(
    (field) => field.show_in_list && !field.deleted_at && !isEmptyValue(values[field.field_key])
  )
  if (fields.length === 0) return null
  return (
    <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
      {fields.map((field) => (
        <div key={field.id} className="flex min-w-0 gap-1">
          <dt className="shrink-0">{field.label}:</dt>
          <dd className="truncate text-slate-700">
            {fieldValueLabel(field, values[field.field_key])}
          </dd>
        </div>
      ))}
    </dl>
  )
}
