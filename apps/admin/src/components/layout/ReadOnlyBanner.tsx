import { Eye } from 'lucide-react'
import { READ_ONLY_MESSAGE, useCanEdit } from '@/hooks/useCanEdit'

/** 보기 전용 계정 안내 (T-130) */
export const ReadOnlyBanner = () => {
  const canEdit = useCanEdit()
  if (canEdit) return null
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-900"
    >
      <Eye className="h-4 w-4" aria-hidden="true" />
      {READ_ONLY_MESSAGE}
    </div>
  )
}
