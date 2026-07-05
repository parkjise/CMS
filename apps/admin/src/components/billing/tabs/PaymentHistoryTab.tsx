import { usePaymentHistory } from '@/hooks/useBilling'

const STATUS_STYLE: Record<string, string> = {
  SUCCESS: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-600',
  REFUNDED: 'bg-amber-100 text-amber-700',
}

export function PaymentHistoryTab() {
  const { data, isLoading, isError } = usePaymentHistory()

  if (isLoading) return <p className="text-sm text-slate-400">불러오는 중…</p>
  if (isError)
    return <p className="text-sm text-red-500">결제 내역을 불러오지 못했습니다.</p>

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
          <tr>
            <th className="px-4 py-3">주문번호</th>
            <th className="px-4 py-3">금액</th>
            <th className="px-4 py-3">상태</th>
            <th className="px-4 py-3">결제일</th>
            <th className="px-4 py-3">영수증</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data?.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-3 font-mono text-xs text-slate-500">
                {p.order_id}
              </td>
              <td className="px-4 py-3">{p.amount.toLocaleString()}원</td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    STATUS_STYLE[p.status] ?? 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {p.status}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-500">
                {p.paid_at
                  ? new Date(p.paid_at).toLocaleDateString('ko-KR')
                  : '—'}
              </td>
              <td className="px-4 py-3">
                {p.receipt_url ? (
                  <a
                    href={p.receipt_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:underline"
                  >
                    보기
                  </a>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
            </tr>
          ))}
          {data && data.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                결제 내역이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
