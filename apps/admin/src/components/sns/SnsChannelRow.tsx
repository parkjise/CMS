import { useState } from 'react'
import {
  Check,
  type LucideIcon,
  Loader2,
  X,
} from 'lucide-react'
import { Button, Input, Toggle } from '@cms/ui'
import { useTestSnsUrl } from '@/hooks/useSns'

interface SnsChannelRowProps {
  label: string
  icon: LucideIcon
  iconBg: string
  value: string
  onChange: (v: string) => void
}

type TestResult = 'idle' | 'pending' | 'valid' | 'invalid'

export function SnsChannelRow({
  label,
  icon: Icon,
  iconBg,
  value,
  onChange,
}: SnsChannelRowProps) {
  const isActive = value.trim().length > 0
  const [draft, setDraft] = useState(value)
  const [testResult, setTestResult] = useState<TestResult>('idle')
  const testMutation = useTestSnsUrl()

  // 외부 prop 변경 시 draft 동기화 (이미 저장된 값으로)
  if (value !== draft && testMutation.isIdle && testResult === 'idle') {
    setDraft(value)
  }

  const handleToggle = (next: boolean) => {
    if (next) {
      // 빈 URL을 활성화 → 입력 가능 상태만 유지 (저장은 사용자 직접)
      setDraft(draft || '')
    } else {
      // 비활성화 → 부모 상태에서 URL 비움
      setDraft('')
      onChange('')
      setTestResult('idle')
    }
  }

  const handleTest = async () => {
    if (!draft) return
    setTestResult('pending')
    try {
      const ok = await testMutation.mutateAsync(draft)
      setTestResult(ok ? 'valid' : 'invalid')
    } catch {
      setTestResult('invalid')
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <span
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md ${iconBg}`}
      >
        <Icon className="h-5 w-5" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-900">{label}</span>
          <Toggle
            checked={isActive}
            onChange={(e) => handleToggle(e.target.checked)}
            aria-label={`${label} 활성화`}
          />
        </div>
        {isActive && (
          <div className="flex items-center gap-2">
            <Input
              type="url"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                onChange(e.target.value)
                setTestResult('idle')
              }}
              placeholder="https://..."
              className="flex-1"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleTest}
              disabled={!draft || testResult === 'pending'}
            >
              {testResult === 'pending' && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              연결 테스트
            </Button>
            <TestBadge result={testResult} />
          </div>
        )}
      </div>
    </div>
  )
}

function TestBadge({ result }: { result: TestResult }) {
  if (result === 'idle' || result === 'pending') return null
  if (result === 'valid') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
        <Check className="h-3 w-3" />
        연결됨
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
      <X className="h-3 w-3" />
      연결 실패
    </span>
  )
}
