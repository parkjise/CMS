import dayjs from 'dayjs'
import { Link } from 'react-router'
import type { ReportAction, ReportReason, ReportedPost } from '@cms/types'
import { Button, toast } from '@cms/ui'
import { BoardPageTitle } from '@/components/boards/BoardPageTitle'
import { useCanEdit } from '@/hooks/useCanEdit'
import { useReportedPosts, useResolveReports } from '@/hooks/useBoards'
import { pickErrorMessage } from '@/lib/errorMessages'
import { STATUS_LABELS, STATUS_STYLES } from '@/pages/BoardPostsPage'

const REASON_LABELS: Record<ReportReason, string> = {
  SPAM: '스팸 · 광고',
  ABUSE: '욕설 · 비방',
  PRIVACY: '개인정보 노출',
  OTHER: '기타',
}

const ACTION_DONE: Record<ReportAction, string> = {
  DISMISS: '신고를 닫았습니다. 글은 그대로입니다.',
  PUBLISH: '신고를 닫고 글을 다시 공개했습니다.',
  HIDE: '신고를 닫고 글을 비공개로 바꿨습니다.',
  DELETE: '신고를 닫고 글을 휴지통으로 옮겼습니다.',
}

function ReportRow({ item, canEdit }: { item: ReportedPost; canEdit: boolean }) {
  const resolve = useResolveReports()

  const run = (action: ReportAction) => {
    if (action === 'DELETE' && !window.confirm(`'${item.title}' 을(를) 휴지통으로 옮길까요?`))
      return
    resolve.mutate(
      { postId: item.post_id, action },
      {
        onSuccess: () => toast.success(ACTION_DONE[action]),
        onError: (error) => toast.error(pickErrorMessage(error, '처리하지 못했습니다.')),
      }
    )
  }

  const reasons = Object.entries(item.reasons) as [ReportReason, number][]
  return (
    <li className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={`/admin/boards/${item.board_id}/posts/${item.post_id}/edit`}
          className="min-w-0 truncate font-medium text-slate-900 hover:underline"
        >
          {item.title}
        </Link>
        <span className="text-xs text-slate-500">{item.board_name}</span>
        {item.deleted ? (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">휴지통</span>
        ) : (
          <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_STYLES[item.status]}`}>
            {STATUS_LABELS[item.status]}
          </span>
        )}
      </div>
      <p className="text-sm text-slate-600">
        신고 {item.report_count.toLocaleString()}건 ·{' '}
        {reasons.map(([reason, count]) => `${REASON_LABELS[reason]} ${count}`).join(', ')} · 최근{' '}
        {dayjs(item.latest_at).format('YYYY.MM.DD HH:mm')}
      </p>
      {item.details.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-500">
          {item.details.map((detail, index) => (
            <li key={index}>{detail}</li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={resolve.isPending}
            onClick={() => run('DISMISS')}
          >
            신고 닫기
          </Button>
          {item.status === 'PRIVATE' && !item.deleted && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={resolve.isPending}
              onClick={() => run('PUBLISH')}
            >
              다시 공개
            </Button>
          )}
          {item.status === 'PUBLISHED' && !item.deleted && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={resolve.isPending}
              onClick={() => run('HIDE')}
            >
              비공개로
            </Button>
          )}
          {!item.deleted && (
            <Button
              type="button"
              size="sm"
              variant="danger"
              disabled={resolve.isPending}
              onClick={() => run('DELETE')}
            >
              휴지통으로
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

/** 신고된 글 (BM-11, T-151-B) — 처리하지 않은 신고가 있는 글 */
export function ReportedPostsPage() {
  const canEdit = useCanEdit()
  const reportsQuery = useReportedPosts()
  const items = reportsQuery.data ?? []

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-6 p-6 md:p-8">
      <BoardPageTitle
        title="신고된 글"
        description="홈페이지 방문자가 신고한 글입니다. 신고가 게시판 운영 설정의 기준(기본 5건)만큼 모이면 글은 자동으로 비공개가 되고, 여기서 다시 공개하거나 지울 수 있습니다."
      />
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {reportsQuery.isLoading && (
          <p className="p-8 text-center text-sm text-slate-400">불러오는 중…</p>
        )}
        {reportsQuery.isError && (
          <p className="p-8 text-center text-sm text-red-600">신고를 불러오지 못했습니다.</p>
        )}
        {reportsQuery.isSuccess && items.length === 0 && (
          <p className="p-8 text-center text-sm text-slate-400">처리할 신고가 없습니다.</p>
        )}
        <ul className="divide-y divide-slate-100">
          {items.map((item) => (
            <ReportRow key={item.post_id} item={item} canEdit={canEdit} />
          ))}
        </ul>
      </div>
    </div>
  )
}
