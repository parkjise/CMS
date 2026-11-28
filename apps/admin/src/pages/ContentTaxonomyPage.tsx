import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ArrowDown, ArrowUp, IndentDecrease, IndentIncrease, Pencil, Trash2 } from 'lucide-react'
import { Button, Input, Modal, toast } from '@cms/ui'
import { useCanEdit } from '@/hooks/useCanEdit'
import {
  type ContentCategoryNode,
  type ContentTag,
  useContentCategories,
  useContentTags,
  useCreateContentCategory,
  useCreateContentTag,
  useDeleteContentCategory,
  useDeleteContentTag,
  useMergeContentTags,
  useRenameContentCategory,
  useRenameContentTag,
  useSaveContentCategoryTree,
} from '@/hooks/useContentItems'
import { useContentTypes } from '@/hooks/useContentTypes'
import { pickErrorMessage } from '@/lib/errorMessages'

const NAME_MAX = 30

/** 카테고리 · 태그 (T-257, 콘텐츠 관리 기획서 CM-05) */
export function ContentTaxonomyPage() {
  const canEdit = useCanEdit()
  const types = useContentTypes().data
  const editable = (types?.enabled ?? false) && canEdit

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">카테고리 · 태그</h1>
        <p className="mt-1 text-sm text-slate-500">
          카테고리는 유형마다 두 단계까지, 태그는 모든 콘텐츠가 함께 써요.
        </p>
      </div>
      {types && !types.enabled ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600" role="note">
          콘텐츠 관리가 아직 켜져 있지 않아요. 운영사에 사용을 요청해 주세요.
        </div>
      ) : (
        <>
          <CategorySection editable={editable} />
          <TagSection editable={editable} />
        </>
      )}
    </div>
  )
}

// ── 카테고리 ──────────────────────────────────────────────────────────────

interface FlatCategory {
  id: string
  name: string
  parent_id: string | null
  item_count: number
}

const flatten = (tree: ContentCategoryNode[]): FlatCategory[] =>
  tree.flatMap((node) => [
    { id: node.id, name: node.name, parent_id: null, item_count: node.item_count },
    ...node.children.map((c) => ({
      id: c.id,
      name: c.name,
      parent_id: node.id,
      item_count: c.item_count,
    })),
  ])

/** 맨 위 카테고리 묶음(자기 + 하위) 단위로 다시 펼친다 */
const groupsOf = (list: FlatCategory[]) =>
  list
    .filter((c) => c.parent_id === null)
    .map((top) => [top, ...list.filter((c) => c.parent_id === top.id)])

function CategorySection({ editable }: { editable: boolean }) {
  const types = useContentTypes().data?.types ?? []
  const [params, setParams] = useSearchParams()
  const typeId = params.get('type') ?? types[0]?.id ?? ''
  const { data: tree, isLoading } = useContentCategories(typeId || undefined)
  const create = useCreateContentCategory(typeId)
  const saveTree = useSaveContentCategoryTree(typeId)
  const [list, setList] = useState<FlatCategory[]>([])
  const [newName, setNewName] = useState('')
  const [parentId, setParentId] = useState('')
  const [renaming, setRenaming] = useState<FlatCategory | null>(null)
  const [deleting, setDeleting] = useState<FlatCategory | null>(null)

  useEffect(() => setList(flatten(tree ?? [])), [tree])

  const commit = (next: FlatCategory[]) => {
    setList(next)
    saveTree.mutate(
      next.map((c) => ({ id: c.id, parent_id: c.parent_id })),
      { onError: (err) => toast.error(pickErrorMessage(err, '순서를 바꾸지 못했어요.')) }
    )
  }

  /** 같은 단계 안에서 위 · 아래 */
  const move = (target: FlatCategory, delta: -1 | 1) => {
    if (target.parent_id === null) {
      const groups = groupsOf(list)
      const index = groups.findIndex((g) => g[0].id === target.id)
      const swap = index + delta
      if (swap < 0 || swap >= groups.length) return
      ;[groups[index], groups[swap]] = [groups[swap], groups[index]]
      commit(groups.flat())
      return
    }
    const siblings = list.filter((c) => c.parent_id === target.parent_id)
    const index = siblings.findIndex((c) => c.id === target.id)
    const swap = index + delta
    if (swap < 0 || swap >= siblings.length) return
    ;[siblings[index], siblings[swap]] = [siblings[swap], siblings[index]]
    commit(
      groupsOf(list).flatMap((g) =>
        g[0].id === target.parent_id ? [g[0], ...siblings] : g
      )
    )
  }

  /** 바로 위 맨 위 카테고리의 하위로 — 하위가 있는 카테고리는 못 내린다 */
  const indent = (target: FlatCategory) => {
    const groups = groupsOf(list)
    const index = groups.findIndex((g) => g[0].id === target.id)
    if (index <= 0 || groups[index].length > 1) return
    const parent = groups[index - 1][0]
    groups[index - 1] = [...groups[index - 1], { ...target, parent_id: parent.id }]
    groups.splice(index, 1)
    commit(groups.flat())
  }

  /** 하위 → 맨 위, 상위 바로 다음 자리로 */
  const outdent = (target: FlatCategory) => {
    const groups = groupsOf(list).map((g) => g.filter((c) => c.id !== target.id))
    const index = groups.findIndex((g) => g[0].id === target.parent_id)
    groups.splice(index + 1, 0, [{ ...target, parent_id: null }])
    commit(groups.flat())
  }

  const add = () => {
    const name = newName.trim()
    if (!name) return
    create.mutate(
      { name, parent_id: parentId || null },
      {
        onSuccess: () => {
          setNewName('')
          toast.success(`'${name}' 카테고리를 만들었어요.`)
        },
        onError: (err) => toast.error(pickErrorMessage(err, '카테고리를 만들지 못했어요.')),
      }
    )
  }

  const tops = list.filter((c) => c.parent_id === null)

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">카테고리</h2>
        <select
          aria-label="카테고리 유형"
          value={typeId}
          onChange={(e) =>
            setParams((p) => {
              p.set('type', e.target.value)
              return p
            })
          }
          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
        >
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {types.length === 0 ? (
        <p className="text-sm text-slate-500">콘텐츠 유형을 먼저 만들어 주세요.</p>
      ) : isLoading ? (
        <div className="h-24 animate-pulse rounded bg-slate-100" />
      ) : list.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">
          아직 카테고리가 없어요.
        </p>
      ) : (
        <ul className="space-y-1.5" aria-label="카테고리 목록">
          {list.map((c) => {
            const isTop = c.parent_id === null
            const siblings = list.filter((x) => x.parent_id === c.parent_id)
            const pos = siblings.findIndex((x) => x.id === c.id)
            const hasChildren = list.some((x) => x.parent_id === c.id)
            const canIndent = isTop && !hasChildren && tops.findIndex((t) => t.id === c.id) > 0
            return (
              <li
                key={c.id}
                className={`flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 ${
                  isTop ? '' : 'ml-8'
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                  {!isTop && <span className="mr-1 text-slate-400">└</span>}
                  {c.name}
                  <span className="ml-2 text-xs text-slate-400">{c.item_count}개</span>
                </span>
                {editable && (
                  <span className="flex items-center">
                    <IconButton label={`${c.name} 위로`} disabled={pos === 0} onClick={() => move(c, -1)}>
                      <ArrowUp className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      label={`${c.name} 아래로`}
                      disabled={pos === siblings.length - 1}
                      onClick={() => move(c, 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </IconButton>
                    {isTop ? (
                      <IconButton
                        label={`${c.name} 위 카테고리 아래로`}
                        disabled={!canIndent}
                        onClick={() => indent(c)}
                      >
                        <IndentIncrease className="h-4 w-4" />
                      </IconButton>
                    ) : (
                      <IconButton label={`${c.name} 맨 위로 올리기`} onClick={() => outdent(c)}>
                        <IndentDecrease className="h-4 w-4" />
                      </IconButton>
                    )}
                    <IconButton label={`${c.name} 이름 바꾸기`} onClick={() => setRenaming(c)}>
                      <Pencil className="h-4 w-4" />
                    </IconButton>
                    <IconButton label={`${c.name} 지우기`} danger onClick={() => setDeleting(c)}>
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {editable && types.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-40 flex-1">
            <Input
              label="새 카테고리"
              value={newName}
              maxLength={NAME_MAX}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) add()
              }}
            />
          </div>
          <select
            aria-label="새 카테고리 위치"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
          >
            <option value="">맨 위</option>
            {tops.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} 아래
              </option>
            ))}
          </select>
          <Button type="button" loading={create.isPending} disabled={!newName.trim()} onClick={add}>
            카테고리 추가
          </Button>
        </div>
      )}

      <RenameCategoryDialog category={renaming} onClose={() => setRenaming(null)} />
      <DeleteCategoryDialog
        category={deleting}
        candidates={list.filter(
          (c) => deleting && c.id !== deleting.id && c.parent_id !== deleting.id
        )}
        onClose={() => setDeleting(null)}
      />
    </section>
  )
}

function IconButton({
  label,
  disabled,
  danger,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  danger?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded p-1.5 text-slate-400 disabled:opacity-30 ${
        danger ? 'hover:bg-rose-50 hover:text-rose-600' : 'hover:bg-slate-100 hover:text-slate-600'
      }`}
    >
      {children}
    </button>
  )
}

function RenameCategoryDialog({
  category,
  onClose,
}: {
  category: FlatCategory | null
  onClose: () => void
}) {
  const rename = useRenameContentCategory()
  return (
    <NameDialog
      title="카테고리 이름 바꾸기"
      initial={category?.name ?? null}
      saving={rename.isPending}
      onClose={onClose}
      onSave={(name) =>
        category &&
        rename.mutate(
          { id: category.id, name },
          {
            onSuccess: () => {
              toast.success('이름을 바꿨어요.')
              onClose()
            },
            onError: (err) => toast.error(pickErrorMessage(err, '이름을 바꾸지 못했어요.')),
          }
        )
      }
    />
  )
}

function DeleteCategoryDialog({
  category,
  candidates,
  onClose,
}: {
  category: FlatCategory | null
  candidates: FlatCategory[]
  onClose: () => void
}) {
  const remove = useDeleteContentCategory()
  const [moveTo, setMoveTo] = useState('')
  useEffect(() => setMoveTo(''), [category])
  return (
    <Modal open={category !== null} onClose={onClose} title="카테고리를 지울까요?" size="sm">
      {category && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            <strong className="text-slate-900">{category.name}</strong>
            {category.parent_id === null && ' 와 하위 카테고리'}가 휴지통으로 옮겨져요. 이
            카테고리의 콘텐츠는 아래에서 고른 곳으로 옮겨요.
          </p>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">콘텐츠 옮길 곳</span>
            <select
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">카테고리 없음</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              취소
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={remove.isPending}
              onClick={() =>
                remove.mutate(
                  { id: category.id, moveTo: moveTo || null },
                  {
                    onSuccess: ({ moved }) => {
                      toast.success(
                        moved ? `지우고 콘텐츠 ${moved}개를 옮겼어요.` : '카테고리를 지웠어요.'
                      )
                      onClose()
                    },
                    onError: (err) => toast.error(pickErrorMessage(err, '카테고리를 지우지 못했어요.')),
                  }
                )
              }
            >
              지우기
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ── 태그 ──────────────────────────────────────────────────────────────────

function TagSection({ editable }: { editable: boolean }) {
  const { data: tags, isLoading } = useContentTags()
  const create = useCreateContentTag()
  const [newName, setNewName] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [renaming, setRenaming] = useState<ContentTag | null>(null)
  const [deleting, setDeleting] = useState<ContentTag | null>(null)
  const [merging, setMerging] = useState(false)

  const add = () => {
    const name = newName.trim()
    if (!name) return
    create.mutate(name, {
      onSuccess: () => {
        setNewName('')
        toast.success(`'${name}' 태그를 만들었어요.`)
      },
      onError: (err) => toast.error(pickErrorMessage(err, '태그를 만들지 못했어요.')),
    })
  }

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">태그</h2>
        {editable && selected.length >= 2 && (
          <Button type="button" size="sm" variant="secondary" onClick={() => setMerging(true)}>
            고른 태그 {selected.length}개 합치기
          </Button>
        )}
      </div>
      {isLoading ? (
        <div className="h-24 animate-pulse rounded bg-slate-100" />
      ) : !tags || tags.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">
          아직 태그가 없어요. 콘텐츠를 쓸 때 붙인 태그도 여기에 모여요.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100" aria-label="태그 목록">
          {tags.map((tag) => (
            <li key={tag.id} className="flex items-center gap-3 py-2">
              {editable && (
                <input
                  type="checkbox"
                  aria-label={`${tag.name} 고르기`}
                  checked={selected.includes(tag.id)}
                  onChange={() =>
                    setSelected((s) =>
                      s.includes(tag.id) ? s.filter((x) => x !== tag.id) : [...s, tag.id]
                    )
                  }
                />
              )}
              <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                #{tag.name}
                <span className="ml-2 text-xs text-slate-400">콘텐츠 {tag.item_count}개</span>
              </span>
              {editable && (
                <span className="flex items-center">
                  <IconButton label={`${tag.name} 이름 바꾸기`} onClick={() => setRenaming(tag)}>
                    <Pencil className="h-4 w-4" />
                  </IconButton>
                  <IconButton label={`${tag.name} 지우기`} danger onClick={() => setDeleting(tag)}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-40 flex-1">
            <Input
              label="새 태그"
              value={newName}
              maxLength={NAME_MAX}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) add()
              }}
            />
          </div>
          <Button type="button" loading={create.isPending} disabled={!newName.trim()} onClick={add}>
            태그 추가
          </Button>
        </div>
      )}

      <RenameTagDialog tag={renaming} onClose={() => setRenaming(null)} />
      <DeleteTagDialog tag={deleting} onClose={() => setDeleting(null)} />
      <MergeTagsDialog
        open={merging}
        tags={(tags ?? []).filter((t) => selected.includes(t.id))}
        onClose={() => setMerging(false)}
        onDone={() => {
          setMerging(false)
          setSelected([])
        }}
      />
    </section>
  )
}

function RenameTagDialog({ tag, onClose }: { tag: ContentTag | null; onClose: () => void }) {
  const rename = useRenameContentTag()
  return (
    <NameDialog
      title="태그 이름 바꾸기"
      initial={tag?.name ?? null}
      saving={rename.isPending}
      onClose={onClose}
      onSave={(name) =>
        tag &&
        rename.mutate(
          { id: tag.id, name },
          {
            onSuccess: () => {
              toast.success('이름을 바꿨어요.')
              onClose()
            },
            onError: (err) => toast.error(pickErrorMessage(err, '이름을 바꾸지 못했어요.')),
          }
        )
      }
    />
  )
}

function DeleteTagDialog({ tag, onClose }: { tag: ContentTag | null; onClose: () => void }) {
  const remove = useDeleteContentTag()
  return (
    <Modal open={tag !== null} onClose={onClose} title="태그를 지울까요?" size="sm">
      {tag && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            <strong className="text-slate-900">#{tag.name}</strong> 태그를 지우면 콘텐츠{' '}
            {tag.item_count}개에서 이 태그가 빠져요. 콘텐츠는 그대로예요.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              취소
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={remove.isPending}
              onClick={() =>
                remove.mutate(tag.id, {
                  onSuccess: () => {
                    toast.success('태그를 지웠어요.')
                    onClose()
                  },
                  onError: (err) => toast.error(pickErrorMessage(err, '태그를 지우지 못했어요.')),
                })
              }
            >
              지우기
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function MergeTagsDialog({
  open,
  tags,
  onClose,
  onDone,
}: {
  open: boolean
  tags: ContentTag[]
  onClose: () => void
  onDone: () => void
}) {
  const merge = useMergeContentTags()
  const [targetId, setTargetId] = useState('')
  useEffect(() => setTargetId(tags[0]?.id ?? ''), [open, tags])
  const target = tags.find((t) => t.id === targetId)
  return (
    <Modal open={open} onClose={onClose} title="태그 합치기" size="sm">
      <div className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm text-slate-600">남길 태그를 골라 주세요</legend>
          {tags.map((t) => (
            <label key={t.id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="merge-target"
                checked={targetId === t.id}
                onChange={() => setTargetId(t.id)}
              />
              #{t.name} <span className="text-xs text-slate-400">({t.item_count})</span>
            </label>
          ))}
        </fieldset>
        {target && (
          <p className="text-xs text-slate-500">
            나머지 태그를 붙인 콘텐츠는 모두 #{target.name} 으로 바뀌고, 나머지 태그는 지워져요.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button
            type="button"
            loading={merge.isPending}
            disabled={!target}
            onClick={() =>
              merge.mutate(
                { source_ids: tags.filter((t) => t.id !== targetId).map((t) => t.id), target_id: targetId },
                {
                  onSuccess: () => {
                    toast.success(`#${target?.name} 으로 합쳤어요.`)
                    onDone()
                  },
                  onError: (err) => toast.error(pickErrorMessage(err, '태그를 합치지 못했어요.')),
                }
              )
            }
          >
            합치기
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── 공통 ──────────────────────────────────────────────────────────────────

function NameDialog({
  title,
  initial,
  saving,
  onClose,
  onSave,
}: {
  title: string
  /** null 이면 닫힘 */
  initial: string | null
  saving: boolean
  onClose: () => void
  onSave: (name: string) => void
}) {
  const [name, setName] = useState('')
  useEffect(() => setName(initial ?? ''), [initial])
  const trimmed = name.trim()
  return (
    <Modal open={initial !== null} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <Input label="이름" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button
            type="button"
            loading={saving}
            disabled={!trimmed || trimmed === initial}
            onClick={() => onSave(trimmed)}
          >
            저장
          </Button>
        </div>
      </div>
    </Modal>
  )
}
