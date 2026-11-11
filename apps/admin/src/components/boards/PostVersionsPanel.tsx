import { useState } from 'react'
import dayjs from 'dayjs'
import type { PostVersionDetail } from '@cms/types'
import { Button } from '@cms/ui'
import { RichTextEditor } from '@/components/boards/RichTextEditor'
import { usePostVersion, usePostVersions } from '@/hooks/useBoards'
import { STATUS_LABELS } from '@/lib/postStatus'

interface PostVersionsPanelProps {
  boardId: string
  postId: string
  /** 되돌리기 — 편집 칸만 채운다. 저장은 관리자가 */
  onRestore?: (version: PostVersionDetail) => void
}

const when = (iso: string) => dayjs(iso).format('MM/DD HH:mm')

/** 글의 이전 버전 (T-191) — 고칠 때마다 고치기 직전 내용, 최근 20개 */
export function PostVersionsPanel({ boardId, postId, onRestore }: PostVersionsPanelProps) {
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const versions = usePostVersions(boardId, postId)
  const selected = usePostVersion(boardId, postId, selectedId)
  const count = versions.data?.length ?? 0

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-700"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          이전 버전 <span className="text-slate-400">({count})</span>
        </span>
        <span className="text-xs text-slate-500">{open ? '접기' : '펼치기'}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 p-4">
          {versions.isError && (
            <p className="text-sm text-red-600">이전 버전을 불러오지 못했습니다.</p>
          )}
          {versions.data && count === 0 && (
            <p className="text-sm text-slate-500">
              아직 이전 버전이 없어요. 글을 고쳐 저장하면 고치기 전 내용이 여기에 남아요.
            </p>
          )}
          {count > 0 && (
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-100">
              {versions.data?.map((version) => (
                <li key={version.id}>
                  <button
                    type="button"
                    aria-pressed={selectedId === version.id}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                      selectedId === version.id ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => setSelectedId(version.id)}
                  >
                    <span className="block truncate font-medium text-slate-800">
                      {version.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {when(version.saved_at)} 저장본 · {STATUS_LABELS[version.status]} ·{' '}
                      {version.editor}이(가) {when(version.replaced_at)}에 고침
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {count > 0 && <p className="text-xs text-slate-500">최근 20개까지 남아요.</p>}
          {selectedId && selected.isError && (
            <p className="text-sm text-red-600">이 버전을 불러오지 못했습니다.</p>
          )}
          {selected.data && (
            <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="mr-auto text-sm font-semibold text-slate-900">
                  {selected.data.title}
                </p>
                {onRestore && (
                  <Button type="button" size="sm" onClick={() => onRestore(selected.data)}>
                    이 버전으로 되돌리기
                  </Button>
                )}
              </div>
              <RichTextEditor
                key={selected.data.id}
                initial={selected.data.body}
                editable={false}
                onChange={() => undefined}
              />
            </div>
          )}
        </div>
      )}
    </section>
  )
}
