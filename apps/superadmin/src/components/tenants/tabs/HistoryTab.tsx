import { useTenantAuditLogs } from '@/hooks/useTenant'

interface Props {
  tenantId: string
}

const ACTION_LABELS: Record<string, string> = {
  TENANT_CREATED: '테넌트 생성',
  TENANT_UPDATED: '정보 수정',
  TENANT_PLAN_CHANGED: '플랜 변경',
  TENANT_DELETED: '테넌트 삭제',
  TENANT_PASSWORD_RESET: '비밀번호 초기화',
  FEATURE_TOGGLED: '기능 토글',
  IMPERSONATE_START: '대리 접속',
}

export function HistoryTab({ tenantId }: Props) {
  const { data, isLoading } = useTenantAuditLogs(tenantId)

  if (isLoading) return <p className="text-sm text-slate-400">불러오는 중…</p>
  if (!data || data.length === 0) {
    return <p className="text-sm text-slate-400">변경 이력이 없습니다.</p>
  }

  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {data.map((log) => (
        <li key={log.id} className="flex items-start justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <span className="text-sm font-medium text-slate-800">
              {ACTION_LABELS[log.action] ?? log.action}
            </span>
            {log.after_value && (
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {JSON.stringify(log.after_value)}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right text-xs text-slate-400">
            <div>{log.actor_role}</div>
            <div>{new Date(log.created_at).toLocaleString('ko-KR')}</div>
          </div>
        </li>
      ))}
    </ul>
  )
}
