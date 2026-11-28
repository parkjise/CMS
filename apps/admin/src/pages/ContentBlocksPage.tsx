import { useState } from 'react'
import dayjs from 'dayjs'
import { Link } from 'react-router'
import { Blocks, Pencil, Trash2 } from 'lucide-react'
import { Button, Input, Modal, toast } from '@cms/ui'
import { useCanEdit } from '@/hooks/useCanEdit'
import {
  type ContentBlock,
  useContentBlocks,
  useDeleteContentBlock,
  useRenameContentBlock,
} from '@/hooks/useContentBlocks'
import { pickErrorMessage } from '@/lib/errorMessages'

const NAME_MAX = 40

/** 공통 블록 (T-260, 콘텐츠 관리 기획서 CM-04) — 블록 · 쓰는 곳 · 이름 · 지우기 */
export function ContentBlocksPage() {
  const canEdit = useCanEdit()
  const { data: blocks, isLoading, isError } = useContentBlocks()
  const [renaming, setRenaming] = useState<ContentBlock | null>(null)
  const [deleting, setDeleting] = useState<ContentBlock | null>(null)

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">공통 블록</h1>
        <p className="mt-1 text-sm text-slate-500">
          여러 페이지에 같은 섹션을 넣을 때 써요. 섹션 편집 화면의 [공통 블록으로 저장]으로 만들고,
          섹션 추가에서 &lsquo;공통 블록에서&rsquo;로 넣어요.
        </p>
      </div>

      {isLoading ? (
        <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
      ) : isError ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          공통 블록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
        </div>
      ) : !blocks || blocks.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-300 p-8 text-center">
          <Blocks className="h-8 w-8 text-slate-300" aria-hidden="true" />
          <p className="font-medium text-slate-900">아직 공통 블록이 없어요</p>
          <p className="text-sm text-slate-500">
            페이지 관리에서 섹션을 열고 [공통 블록으로 저장]을 눌러 보세요.
          </p>
        </div>
      ) : (
        <ul className="space-y-2" aria-label="공통 블록 목록">
          {blocks.map((block) => (
            <li key={block.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{block.name}</p>
                  <p className="text-xs text-slate-500">
                    {block.type_label} · {block.usage.length}곳에서 사용 · 수정{' '}
                    {dayjs(block.updated_at).format('YYYY.MM.DD')}
                  </p>
                </div>
                {canEdit && (
                  <span className="flex items-center">
                    <button
                      type="button"
                      aria-label={`${block.name} 이름 바꾸기`}
                      onClick={() => setRenaming(block)}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`${block.name} 지우기`}
                      onClick={() => setDeleting(block)}
                      className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </span>
                )}
              </div>
              {block.usage.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2 text-xs" aria-label={`${block.name} 쓰는 곳`}>
                  {block.usage.map((u) => (
                    <li key={u.section_id}>
                      <Link
                        to={`/admin/pages/${u.page_key}/sections/${u.section_id}`}
                        className="rounded bg-slate-100 px-2 py-1 text-slate-600 hover:bg-slate-200"
                      >
                        {u.page_key === 'home' ? '홈' : u.page_key} · {u.label}
                        {!u.is_active && ' (숨김)'}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <RenameDialog block={renaming} onClose={() => setRenaming(null)} />
      <DeleteDialog block={deleting} onClose={() => setDeleting(null)} />
    </div>
  )
}

function RenameDialog({ block, onClose }: { block: ContentBlock | null; onClose: () => void }) {
  const rename = useRenameContentBlock()
  const [name, setName] = useState('')
  const [shown, setShown] = useState<string | null>(null)
  if (block && shown !== block.id) {
    setShown(block.id)
    setName(block.name)
  }
  return (
    <Modal open={block !== null} onClose={onClose} title="블록 이름 바꾸기" size="sm">
      {block && (
        <div className="space-y-4">
          <Input label="이름" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              취소
            </Button>
            <Button
              type="button"
              loading={rename.isPending}
              disabled={!name.trim() || name.trim() === block.name}
              onClick={() =>
                rename.mutate(
                  { id: block.id, name: name.trim() },
                  {
                    onSuccess: () => {
                      toast.success('이름을 바꿨어요.')
                      onClose()
                    },
                    onError: (err) => toast.error(pickErrorMessage(err, '이름을 바꾸지 못했어요.')),
                  }
                )
              }
            >
              저장
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function DeleteDialog({ block, onClose }: { block: ContentBlock | null; onClose: () => void }) {
  const remove = useDeleteContentBlock()
  const used = (block?.usage.length ?? 0) > 0
  return (
    <Modal open={block !== null} onClose={onClose} title="블록을 지울까요?" size="sm">
      {block && (
        <div className="space-y-4">
          {used ? (
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800" role="note">
              <strong>{block.name}</strong> 블록을 {block.usage.length}곳에서 쓰고 있어요. 각
              섹션에서 [연결 끊고 이 섹션만 고치기]를 먼저 눌러 주세요.
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              <strong className="text-slate-900">{block.name}</strong> 블록을 지워요. 이미 복사해
              넣은 섹션은 그대로예요.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              {used ? '닫기' : '취소'}
            </Button>
            {!used && (
              <Button
                type="button"
                variant="danger"
                loading={remove.isPending}
                onClick={() =>
                  remove.mutate(block.id, {
                    onSuccess: () => {
                      toast.success('블록을 지웠어요.')
                      onClose()
                    },
                    onError: (err) => toast.error(pickErrorMessage(err, '블록을 지우지 못했어요.')),
                  })
                }
              >
                지우기
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
