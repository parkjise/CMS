import type { ReactNode } from 'react'
import { useCanEdit } from '@/hooks/useCanEdit'

interface ReadOnlyFieldsetProps {
  children: ReactNode
  className?: string
}

/** 보기 전용 계정이면 안의 입력칸 · 버튼을 모두 잠근다 — 링크는 그대로 (T-130) */
export const ReadOnlyFieldset = ({ children, className = 'min-w-0' }: ReadOnlyFieldsetProps) => {
  const canEdit = useCanEdit()
  return (
    <fieldset disabled={!canEdit} className={className}>
      {children}
    </fieldset>
  )
}
