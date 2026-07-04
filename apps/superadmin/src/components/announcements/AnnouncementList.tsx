import { Send, Trash2 } from 'lucide-react'
import { Badge, toast } from '@cms/ui'
import {
  useAnnouncements,
  useDeleteAnnouncement,
  useSendAnnouncement,
} from '@/hooks/useAnnouncements'
import { TypeBadge } from './TypeBadge'

const TARGET_LABELS: Record<string, string> = {
  ALL: '전체',
  PLAN_BASED: '플랜별',
  SELECTIVE: '선택',
}

export function AnnouncementList() {
  const { data, isLoading, isError } = useAnnouncements()
  const del = useDeleteAnnouncement()
  const send = useSendAnnouncement()

  const handleSend = async (id: string) => {
    const res = await send.mutateAsync(id)
    toast.success(`${res.target_count}개 테넌트에 발송했습니다.`)
  }

  if (isLoading) return <p className="text-sm text-slate-400">불러오는 중…</p>
  if (isError)
    return <p className="text-sm text-red-500">공지 목록을 불러오지 못했습니다.</p>

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-slate-900">공지 목록</h2>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {data?.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <TypeBadge type={a.type} />
                <span className="truncate font-medium text-slate-800">
                  {a.title}
                </span>
                {!a.is_published && <Badge variant="default">임시저장</Badge>}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                대상 {TARGET_LABELS[a.target_type] ?? a.target_type}
                {a.target_plan ? ` (${a.target_plan})` : ''} · 읽음 {a.read_count}명
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => handleSend(a.id)}
                className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50"
              >
                <Send className="h-3 w-3" />
                발송
              </button>
              <button
                type="button"
                onClick={() => del.mutate(a.id)}
                aria-label="삭제"
                className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
        {data && data.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-slate-400">
            작성된 공지가 없습니다.
          </li>
        )}
      </ul>
    </section>
  )
}
