import { useState } from 'react'
import dayjs from 'dayjs'
import { Link } from 'react-router'
import { Button, toast } from '@cms/ui'
import { LIST_CARD, TD, TH } from '@/components/boards/boardStyles'
import { useBulkPosts, usePostOverview, usePurgePosts } from '@/hooks/useBoards'
import { useCanEdit } from '@/hooks/useCanEdit'
import { pickErrorMessage } from '@/lib/errorMessages'
import { purgeLabel } from '@/lib/trash'

const PAGE_SIZE = 20

/** 휴지통 › 글 (T-209, BM-07) — 모든 게시판의 지운 글, 복원 · 영구 삭제 · 선택 처리 */
export function TrashPostsSection() {
  const canEdit = useCanEdit()
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const query = usePostOverview({ page, size: PAGE_SIZE, trash: true })
  const bulk = useBulkPosts()
  const purgePosts = usePurgePosts()
  const posts = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const allChecked = posts.length > 0 && posts.every((p) => selected.has(p.id))
  const busy = bulk.isPending || purgePosts.isPending

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const restore = async (ids: string[]) => {
    try {
      const count = await bulk.mutateAsync({ post_ids: ids, action: 'RESTORE' })
      toast.success(`글 ${count}개를 복원했습니다.`)
      setSelected(new Set())
    } catch (error) {
      toast.error(pickErrorMessage(error, '복원하지 못했습니다.'))
    }
  }

  const purge = async (ids: string[], title?: string) => {
    const what = title ? `'${title}' 글을` : `글 ${ids.length}개를`
    if (!window.confirm(`${what} 영구 삭제할까요? 되돌릴 수 없습니다.`)) return
    try {
      const count = await purgePosts.mutateAsync(ids)
      toast.success(`글 ${count}개를 영구 삭제했습니다.`)
      setSelected(new Set())
      if (page > 1 && count >= posts.length) setPage(page - 1)
    } catch (error) {
      toast.error(pickErrorMessage(error, '영구 삭제하지 못했습니다.'))
    }
  }

  if (query.isError) return <p className="text-sm text-red-600">휴지통을 불러오지 못했습니다.</p>
  if (query.isLoading) return <div className="h-32 animate-pulse rounded-xl bg-slate-100" />

  const picked = [...selected]
  return (
    <section className={LIST_CARD} aria-label="삭제된 글">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-800">
          삭제된 글 ({total.toLocaleString()})
        </h2>
        {canEdit && picked.length > 0 && (
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => restore(picked)}
            >
              선택 복원 ({picked.length})
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={() => purge(picked)}
            >
              선택 영구 삭제 ({picked.length})
            </Button>
          </div>
        )}
      </div>
      {posts.length === 0 ? (
        <p className="p-12 text-center text-sm text-slate-500">휴지통에 글이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-slate-200">
              <tr>
                {canEdit && (
                  <th className={`${TH} w-10 pl-6`}>
                    <input
                      type="checkbox"
                      aria-label="이 쪽 글 모두 선택"
                      checked={allChecked}
                      onChange={(e) =>
                        setSelected(e.target.checked ? new Set(posts.map((p) => p.id)) : new Set())
                      }
                    />
                  </th>
                )}
                <th className={`${TH} ${canEdit ? '' : 'pl-6'}`}>제목</th>
                <th className={TH}>게시판</th>
                <th className={TH}>삭제일</th>
                <th className={TH}>영구 삭제</th>
                <th className={TH}>관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {posts.map((post) => (
                <tr key={post.id}>
                  {canEdit && (
                    <td className={`${TD} pl-6`}>
                      <input
                        type="checkbox"
                        aria-label={`${post.title} 선택`}
                        checked={selected.has(post.id)}
                        onChange={(e) => toggle(post.id, e.target.checked)}
                      />
                    </td>
                  )}
                  <td className={`${TD} ${canEdit ? '' : 'pl-6'} font-medium text-slate-800`}>
                    {post.title}
                  </td>
                  <td className={TD}>
                    <Link
                      to={`/admin/boards/${post.board_id}/posts`}
                      className="text-slate-600 hover:text-blue-600 hover:underline"
                    >
                      {post.board_name}
                    </Link>
                  </td>
                  <td className={`${TD} whitespace-nowrap text-xs text-slate-500`}>
                    {post.deleted_at ? `${dayjs(post.deleted_at).format('YYYY.MM.DD')} 삭제` : '-'}
                    {post.deleted_by && <p className="mt-0.5 text-slate-400">{post.deleted_by}</p>}
                  </td>
                  <td className={`${TD} whitespace-nowrap text-xs text-amber-700`}>
                    {purgeLabel(post) ?? '-'}
                  </td>
                  <td className={TD}>
                    {canEdit && (
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() => restore([post.id])}
                        >
                          복원
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-600"
                          disabled={busy}
                          onClick={() => purge([post.id], post.title)}
                        >
                          영구 삭제
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {lastPage > 1 && (
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-3 text-sm text-slate-500">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => {
              setPage(page - 1)
              setSelected(new Set())
            }}
          >
            이전
          </Button>
          <span>
            {page} / {lastPage}
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={page >= lastPage}
            onClick={() => {
              setPage(page + 1)
              setSelected(new Set())
            }}
          >
            다음
          </Button>
        </div>
      )}
    </section>
  )
}
