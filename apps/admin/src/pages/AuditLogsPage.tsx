import { useState } from 'react'
import dayjs from 'dayjs'
import type { AuditLogKind } from '@cms/types'
import { Button } from '@cms/ui'
import { AUDIT_PAGE_SIZE, useAuditLogs } from '@/hooks/useBoards'
import { AUDIT_KIND_LABELS, actionLabel, auditTarget } from '@/lib/auditLabels'

const KINDS = Object.entries(AUDIT_KIND_LABELS) as [AuditLogKind, string][]

/** 변경 기록 (T-186) — 게시판 · 글 · 칸 · 카테고리를 누가 언제 바꿨는지. 보기만 한다 */
export function AuditLogsPage() {
  const [kind, setKind] = useState<AuditLogKind | null>(null)
  const [page, setPage] = useState(1)
  const logsQuery = useAuditLogs(kind, page)
  const items = logsQuery.data?.items ?? []
  const total = logsQuery.data?.total ?? 0
  const lastPage = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE))

  const pick = (next: AuditLogKind | null) => {
    setKind(next)
    setPage(1)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">변경 기록</h1>
        <p className="mt-1 text-sm text-slate-500">
          게시판을 만들거나 설정을 바꾸고, 글을 휴지통에 넣거나 옮긴 기록입니다. 글 내용을 저장한 것은 남기지 않습니다.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="기록 종류">
        {[[null, '전체'] as const, ...KINDS].map(([value, label]) => (
          <Button
            key={label}
            type="button"
            size="sm"
            variant={kind === value ? 'primary' : 'secondary'}
            aria-pressed={kind === value}
            onClick={() => pick(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        {logsQuery.isLoading && <p className="p-8 text-center text-sm text-slate-400">불러오는 중…</p>}
        {logsQuery.isError && <p className="p-8 text-center text-sm text-red-600">기록을 불러오지 못했습니다.</p>}
        {logsQuery.isSuccess && items.length === 0 && (
          <p className="p-8 text-center text-sm text-slate-400">아직 기록이 없어요.</p>
        )}
        {items.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">날짜</th>
                <th className="px-4 py-2 font-medium">한 일</th>
                <th className="px-4 py-2 font-medium">대상</th>
                <th className="px-4 py-2 font-medium">한 사람</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((entry) => (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                    {dayjs(entry.created_at).format('YYYY.MM.DD HH:mm')}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-900">
                    {actionLabel(entry.action)}
                  </td>
                  <td className="px-4 py-2 text-slate-700">{auditTarget(entry)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-500">{entry.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {total > AUDIT_PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button type="button" size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            이전
          </Button>
          <span className="text-slate-500">
            {page} / {lastPage}
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={page >= lastPage}
            onClick={() => setPage(page + 1)}
          >
            다음
          </Button>
        </div>
      )}
    </div>
  )
}
