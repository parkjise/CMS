import { useState } from 'react'
import { CheckCircle2, Circle, ExternalLink, Loader2 } from 'lucide-react'
import { Button, Input, toast } from '@cms/ui'
import {
  useDomainLimits,
  useDomainStatus,
  useRegisterDomain,
  useRemoveDomain,
  useVerifyDomain,
  type DomainInfo,
  type DomainStatus,
} from '@/hooks/useDomain'
import { pickErrorMessage } from '@/lib/errorMessages'

const STAGES: { key: DomainStatus; label: string }[] = [
  { key: 'PENDING', label: '등록 접수' },
  { key: 'DNS_CHECKING', label: 'DNS 확인' },
  { key: 'SSL_ISSUING', label: '보안 인증서(SSL) 발급' },
  { key: 'ACTIVE', label: '연결 완료' },
]

const ORDER: DomainStatus[] = ['PENDING', 'DNS_CHECKING', 'SSL_ISSUING', 'ACTIVE']

const FAILURE_MESSAGES: Record<string, string> = {
  DNS: '도메인이 아직 우리 서버를 가리키지 않습니다. 아래 DNS 설정을 확인하세요. 설정을 바꾼 뒤 반영까지 최대 24시간 걸릴 수 있습니다.',
  SSL: '보안 인증서를 발급하지 못했습니다. 잠시 후 다시 시도하고, 계속 실패하면 고객센터로 문의해 주세요.',
}

/** 도메인 업체 DNS 관리 화면에 넣을 값 (기획서 15.3) */
const DnsGuide = ({ domain, target }: { domain: string; target: string }) => {
  const isWww = domain.startsWith('www.')
  return (
    <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
      <p className="font-medium text-slate-800">도메인 업체의 DNS 설정에 추가하세요</p>
      <dl className="mt-2 grid grid-cols-[4rem_1fr] gap-x-2 gap-y-1">
        <dt>종류</dt>
        <dd className="font-medium text-slate-800">CNAME</dd>
        <dt>이름</dt>
        <dd className="font-medium break-all text-slate-800">{isWww ? 'www' : domain}</dd>
        <dt>값</dt>
        <dd className="font-medium break-all text-slate-800">{target}</dd>
      </dl>
      {!isWww && (
        <p className="mt-2">
          www 없는 주소는 업체에 따라 CNAME 을 넣을 수 없습니다. 그럴 때는 www 주소로 연결하거나
          서버 IP 를 고객센터에 문의해 주세요.
        </p>
      )}
    </div>
  )
}

const StatusNote = ({ data }: { data: DomainInfo }) => {
  if (data.status === 'FAILED') {
    return (
      <p role="alert" className="mt-1 text-xs text-red-600">
        {FAILURE_MESSAGES[data.failure_code ?? 'DNS'] ?? FAILURE_MESSAGES.DNS}
      </p>
    )
  }
  if (data.status === 'SSL_ISSUING') {
    return <p className="mt-1 text-xs text-slate-500">보안 인증서를 발급하고 있습니다. 보통 1분 안에 끝납니다.</p>
  }
  if (data.status === 'ACTIVE') {
    return (
      <p className="mt-1 text-xs text-slate-500">
        연결되었습니다.
        {data.ssl_expires_at &&
          ` 보안 인증서는 자동으로 갱신됩니다 (현재 만료일 ${new Date(data.ssl_expires_at).toLocaleDateString('ko-KR')}).`}
      </p>
    )
  }
  return <p className="mt-1 text-xs text-slate-500">DNS 설정 후 자동으로 확인합니다. 반영까지 최대 24시간 걸릴 수 있습니다.</p>
}

export function DomainTab() {
  const { data, isLoading } = useDomainStatus()
  const limits = useDomainLimits()
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
    } catch (e) {
      toast.error(pickErrorMessage(e, '도메인 등록에 실패했습니다.'))
    }
  }

  const handleVerify = () => {
    verify.mutate(undefined, {
      onError: (e) => toast.error(pickErrorMessage(e, '확인하지 못했습니다.')),
    })
  }

  const handleRemove = () => {
    if (!window.confirm('연결을 해제하면 이 주소로 홈페이지에 접속할 수 없습니다. 해제할까요?')) return
    remove.mutate(undefined, {
      onError: (e) => toast.error(pickErrorMessage(e, '연결을 해제하지 못했습니다.')),
    })
  }

  if (isLoading) return <p className="text-sm text-slate-400">불러오는 중…</p>

  // 등록된 도메인이 없으면 등록 폼
  if (!data) {
    const locked = limits.data?.custom_domain_allowed === false
    return (
      <section className="max-w-lg rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">커스텀 도메인 연결</h2>
        <p className="mt-1 text-xs text-slate-500">
          {locked
            ? '커스텀 도메인은 STANDARD 이상 요금제에서 연결할 수 있습니다. [구독 현황] 탭에서 요금제를 바꿀 수 있어요.'
            : '보유한 도메인을 연결할 수 있습니다. www 로 시작하는 주소를 권장합니다.'}
        </p>
        <div className="mt-3 flex gap-2">
          <Input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="www.mysite.com"
            aria-label="연결할 도메인"
            className="flex-1"
            disabled={locked}
          />
          <Button onClick={handleRegister} loading={register.isPending} disabled={locked}>
            등록
          </Button>
        </div>
      </section>
    )
  }

  const failed = data.status === 'FAILED'
  // 실패는 어느 단계에서 멈췄는지 — DNS 실패는 DNS 단계, SSL 실패는 SSL 단계
  const shownStatus: DomainStatus = failed
    ? data.failure_code === 'SSL'
      ? 'SSL_ISSUING'
      : 'DNS_CHECKING'
    : data.status
  const currentIndex = ORDER.indexOf(shownStatus)
  const showGuide = data.status === 'PENDING' || data.status === 'DNS_CHECKING' || data.failure_code === 'DNS' || (failed && !data.failure_code)

  return (
    <section className="max-w-lg space-y-5 rounded-xl border border-slate-200 bg-white p-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">
          {data.status === 'ACTIVE' ? (
            <a
              href={`https://${data.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
            >
              {data.domain}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : (
            data.domain
          )}
        </h2>
        <StatusNote data={data} />
      </div>

      {showGuide && <DnsGuide domain={data.domain} target={data.cname_target} />}

      {/* 진행 단계 */}
      <ol className="space-y-2">
        {STAGES.map((stage, i) => {
          const done = data.status === 'ACTIVE' || i < currentIndex
          const active = i === currentIndex && data.status !== 'ACTIVE'
          return (
            <li key={stage.key} className="flex items-center gap-2 text-sm">
              {done ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : active && failed ? (
                <Circle className="h-4 w-4 text-red-500" />
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
        {data.status !== 'ACTIVE' && data.status !== 'SSL_ISSUING' && (
          <Button variant="secondary" onClick={handleVerify} loading={verify.isPending}>
            {failed ? '다시 확인' : 'DNS 전파 확인'}
          </Button>
        )}
        <Button variant="ghost" onClick={handleRemove} loading={remove.isPending}>
          연결 해제
        </Button>
      </div>
    </section>
  )
}
