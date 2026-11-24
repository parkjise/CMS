import { Input } from '@cms/ui'
import { usePageKeyProblem } from '@/hooks/usePageKeyProblem'
import { pageKeyError } from '@/lib/pageKey'
import { useAuthStore } from '@/stores/authStore'

interface PageKeyFieldProps {
  id: string
  value: string
  onChange: (value: string) => void
  /** 지금 저장된 주소 — 그대로면 묻지 않는다 */
  current?: string
  /** 서버가 돌려준 오류 (만들기 · 저장 실패) */
  error?: string
  disabled?: boolean
  helperText?: string
}

/** 페이지 주소 — /{사업체}/ 뒤에 붙는 부분 (PM-02) */
export function PageKeyField({
  id,
  value,
  onChange,
  current,
  error,
  disabled,
  helperText,
}: PageKeyFieldProps) {
  const tenantSlug = useAuthStore((s) => s.tenantSlug)
  const problem = usePageKeyProblem(value, current)
  const ok = value && value !== current && !problem && !error && !pageKeyError(value)
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        주소 <span className="text-rose-500">*</span>
      </label>
      <div className="flex items-start gap-1.5">
        <span className="shrink-0 pt-2.5 text-sm text-slate-500">/{tenantSlug ?? '사업체'}/</span>
        <div className="min-w-0 flex-1">
          <Input
            id={id}
            value={value}
            maxLength={40}
            disabled={disabled}
            autoCapitalize="off"
            spellCheck={false}
            onChange={(e) => onChange(e.target.value.trim().toLowerCase())}
            error={error ?? problem}
            helperText={ok ? '사용할 수 있는 주소예요.' : helperText}
          />
        </div>
      </div>
    </div>
  )
}
