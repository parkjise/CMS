import { Button } from '@cms/ui'
import { useCanEdit } from '@/hooks/useCanEdit'

interface SaveBarProps {
  dirty: boolean
  saving: boolean
  onReset: () => void
  onSave: () => void
  /** 저장할 수 없는 까닭 — 있으면 저장을 막고 이 문구를 보여 준다 (T-225) */
  error?: string
}

/** 화면 아래 저장 막대 (T-221, 사이트 관리 공통 규칙) — 바꾼 것이 있을 때만 누를 수 있다 */
export const SaveBar = ({ dirty, saving, onReset, onSave, error }: SaveBarProps) => {
  const canEdit = useCanEdit()
  if (!canEdit) return null
  return (
    <div className="sticky bottom-0 z-10 -mx-6 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur md:-mx-8 md:px-8">
      <p
        className={`mr-auto text-sm ${dirty && error ? 'text-rose-600' : 'text-slate-500'}`}
        role="status"
      >
        {dirty && error
          ? error
          : dirty
            ? '저장되지 않은 변경사항이 있습니다.'
            : '모든 변경사항이 저장되었습니다.'}
      </p>
      <Button type="button" variant="secondary" disabled={!dirty || saving} onClick={onReset}>
        변경 취소
      </Button>
      <Button type="button" loading={saving} disabled={!dirty || Boolean(error)} onClick={onSave}>
        변경사항 저장
      </Button>
    </div>
  )
}
