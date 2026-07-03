import { useTenantStats } from '@/hooks/useTenant'

interface Props {
  tenantId: string
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

export function UsageTab({ tenantId }: Props) {
  const { data, isLoading } = useTenantStats(tenantId)

  if (isLoading) return <p className="text-sm text-slate-400">불러오는 중…</p>
  if (!data) return <p className="text-sm text-slate-400">데이터 없음</p>

  const cards = [
    { label: '페이지뷰', value: data.page_views.toLocaleString() },
    { label: '순 방문자', value: data.unique_visitors.toLocaleString() },
    { label: '문의', value: `${data.inquiries.toLocaleString()}건` },
    { label: 'AI 사용', value: `${data.ai_usage.toLocaleString()}건` },
    { label: '스토리지', value: formatBytes(data.storage_bytes) },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl border border-slate-200 bg-white p-4"
        >
          <p className="text-xs font-medium text-slate-500">{c.label}</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{c.value}</p>
        </div>
      ))}
    </div>
  )
}
