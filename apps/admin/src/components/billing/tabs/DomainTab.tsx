import { useState } from 'react'
import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { Button, Input, toast } from '@cms/ui'
import {
  useDomainStatus,
  useRegisterDomain,
  useRemoveDomain,
  useVerifyDomain,
  type DomainStatus,
} from '@/hooks/useDomain'

const STAGES: { key: DomainStatus; label: string }[] = [
  { key: 'PENDING', label: '등록 접수' },
  { key: 'DNS_CHECKING', label: 'DNS 확인' },
  { key: 'SSL_ISSUING', label: 'SSL 발급' },
  { key: 'ACTIVE', label: '연결 완료' },
]

const ORDER: DomainStatus[] = ['PENDING', 'DNS_CHECKING', 'SSL_ISSUING', 'ACTIVE']

export function DomainTab() {
  const { data, isLoading } = useDomainStatus()
  const register = useRegisterDomain()
  const verify = useVerifyDomain()
  const remove = useRemoveDomain()
  const [domain, setDomain] = useState('')

  const handleRegister = async () => {
    if (!domain) return
    try {
      await register.mutateAsync(domain)
      toast.success('도메인이 등록되었습니다. DNS 설정 후 확인을 진행하세요.')
      setDomain('')
    } catch {
      toast.error('도메인 등록에 실패했습니다. (중복 여부 확인)')
    }
  }

  if (isLoading) return <p className="text-sm text-slate-400">불러오는 중…</p>

  // 등록된 도메인이 없으면 등록 폼
  if (!data) {
    return (
      <section className="max-w-lg rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">커스텀 도메인 연결</h2>
        <p className="mt-1 text-xs text-slate-500">
          보유한 도메인을 연결할 수 있습니다. (STANDARD 이상)
        </p>
        <div className="mt-3 flex gap-2">
          <Input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="www.mysite.com"
            className="flex-1"
          />
          <Button onClick={handleRegister} loading={register.isPending}>
            등록
          </Button>
        </div>
      </section>
    )
  }

  const currentIndex = ORDER.indexOf(data.status)

  return (
    <section className="max-w-lg space-y-5 rounded-xl border border-slate-200 bg-white p-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{data.domain}</h2>
        {data.status === 'FAILED' ? (
          <p className="mt-1 text-xs text-red-600">
            연결에 실패했습니다. DNS(CNAME) 설정을 확인 후 다시 시도하세요.
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-500">
            CNAME 대상: <b>{data.cname_target}</b>
          </p>
        )}
      </div>

      {/* 진행 단계 */}
      <ol className="space-y-2">
        {STAGES.map((stage, i) => {
          const done = data.status === 'ACTIVE' || i < currentIndex
          const active = i === currentIndex && data.status !== 'ACTIVE'
          return (
            <li key={stage.key} className="flex items-center gap-2 text-sm">
              {done ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : active ? (
                <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
              ) : (
                <Circle className="h-4 w-4 text-slate-300" />
              )}
              <span className={done || active ? 'text-slate-800' : 'text-slate-400'}>
                {stage.label}
              </span>
            </li>
          )
        })}
      </ol>

      <div className="flex gap-2">
        {data.status !== 'ACTIVE' && (
          <Button
            variant="secondary"
            onClick={() => verify.mutate()}
            loading={verify.isPending}
          >
            DNS 전파 확인
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => remove.mutate()}
          loading={remove.isPending}
        >
          연결 해제
        </Button>
      </div>
    </section>
  )
}
