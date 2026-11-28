import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Copy, GripVertical, Layers, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Button, Modal, toast } from '@cms/ui'
import { useCanEdit } from '@/hooks/useCanEdit'
import {
  type ContentBulkAction,
  type ContentItem,
  type ContentItemFilters,
  type ContentStatus,
  flattenCategories,
  useBulkContentItems,
  useContentCategories,
  useContentItems,
  useContentTags,
  useContentUsage,
  useDeleteContentItem,
  useDuplicateContentItem,
  useReorderContentItems,
  useRestoreContentItem,
  useUpdateContentItem,
} from '@/hooks/useContentItems'
import { useContentTypes } from '@/hooks/useContentTypes'
import { pickErrorMessage } from '@/lib/errorMessages'
import { UsageList } from '@/components/contents/UsageList'

const PAGE_SIZE = 20
// 끌어서 순서를 바꿀 때는 한 유형의 항목을 한 화면에 모두 불러온다
const ORDER_SIZE = 100
const SELECT =
  'h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 sm:flex-none'

type View = 'all' | ContentStatus | 'trash'

const VIEW_LABELS: Record<View, string> = {
  all: '전체',
  PUBLISHED: '공개',
  DRAFT: '초안',
  trash: '휴지통',
}

const BULK_DONE: Record<ContentBulkAction, string> = {
  publish: '공개했어요',
  draft: '초안으로 돌렸어요',
  trash: '휴지통으로 옮겼어요',
  restore: '되살렸어요',
}

/** 콘텐츠 목록 (T-256, 콘텐츠 관리 기획서 CM-01) */
export function ContentItemsPage() {
  const navigate = useNavigate()
  const canEdit = useCanEdit()
  const [params, setParams] = useSearchParams()
  const typeId = params.get('type') ?? ''
  const [view, setView] = useState<View>('all')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [tagId, setTagId] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string[]>([])

  const types = useContentTypes().data
  const tags = useContentTags(types?.enabled ?? false).data ?? []
  const categories = flattenCategories(useContentCategories(typeId || undefined).data ?? [])
  const ordering = Boolean(typeId) && view === 'all' && !search && !categoryId && !tagId
  const filters: ContentItemFilters = {
    page: ordering ? 1 : page,
    size: ordering ? ORDER_SIZE : PAGE_SIZE,
    type_id: typeId || undefined,
    status: view === 'PUBLISHED' || view === 'DRAFT' ? view : undefined,
    category_id: categoryId || undefined,
    tag_id: tagId || undefined,
    q: search || undefined,
    trash: view === 'trash',
  }
  const { data, isLoading, isError } = useContentItems(filters)
  const bulk = useBulkContentItems()

  // 조건이 바뀌면 첫 쪽 · 고른 것 비우기
  useEffect(() => {
    setPage(1)
    setSelected([])
  }, [typeId, view, search, categoryId, tagId])
  useEffect(() => setCategoryId(''), [typeId])

  // 입력을 멈추면 검색
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300)
    return () => clearTimeout(timer)
  }, [query])

  const items = useMemo(() => data?.items ?? [], [data])
  const enabled = types?.enabled ?? false
  const editable = enabled && canEdit
  const sortable = editable && ordering && (data?.total ?? 0) <= ORDER_SIZE
  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1
  const newPath = `/admin/contents/new${typeId ? `?type=${typeId}` : ''}`

  const runBulk = (action: ContentBulkAction) =>
    bulk.mutate(
      { ids: selected, action },
      {
        onSuccess: ({ changed, skipped }) => {
          setSelected([])
          if (changed) toast.success(`${changed}개를 ${BULK_DONE[action]}.`)
          if (skipped.length)
            toast.error(
              action === 'restore'
                ? `${skipped.length}개는 유형이 휴지통에 있어 되살리지 못했어요.`
                : `${skipped.length}개는 필수 칸이 비어 있어 공개하지 못했어요.`
            )
        },
        onError: (err) => toast.error(pickErrorMessage(err, '한꺼번에 바꾸지 못했어요.')),
      }
    )

  if (types && !enabled) {
    return (
      <div className="space-y-6 p-6 md:p-8">
        <h1 className="text-2xl font-bold text-slate-900">콘텐츠 목록</h1>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600" role="note">
          콘텐츠 관리가 아직 켜져 있지 않아요. 운영사에 사용을 요청해 주세요.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">콘텐츠 목록</h1>
          <p className="mt-1 text-sm text-slate-500">
            홈페이지 섹션에 들어갈 서비스 · FAQ · 연혁 같은 정보를 관리합니다. 공개한 콘텐츠만
            홈페이지에 나와요.
          </p>
        </div>
        {editable && (types?.types.length ?? 0) > 0 && (
          <Button type="button" onClick={() => navigate(newPath)}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            콘텐츠 작성
          </Button>
        )}
      </div>

      {types && types.types.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-300 p-8 text-center">
          <Layers className="h-8 w-8 text-slate-300" aria-hidden="true" />
          <p className="font-medium text-slate-900">먼저 콘텐츠 유형을 만들어 주세요</p>
          <p className="text-sm text-slate-500">서비스 소개 · FAQ · 연혁 같은 시작용 유형이 있어요.</p>
          <Link
            to="/admin/contents/types"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            콘텐츠 유형으로
          </Link>
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="콘텐츠 상태" className="flex gap-1 border-b border-slate-200">
            {(['all', 'PUBLISHED', 'DRAFT', 'trash'] as const).map((value) => {
              const counts = data?.counts
              const count = !counts
                ? ''
                : value === 'all'
                  ? counts.all
                  : value === 'PUBLISHED'
                    ? counts.published
                    : value === 'DRAFT'
                      ? counts.draft
                      : counts.trash
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={view === value}
                  onClick={() => setView(value)}
                  className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                    view === value
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {VIEW_LABELS[value]} {count}
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              aria-label="콘텐츠 검색"
              placeholder="제목 · 요약 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm sm:w-auto sm:min-w-0 sm:max-w-xs sm:flex-1"
            />
            <select
              aria-label="유형"
              value={typeId}
              onChange={(e) =>
                setParams((p) => {
                  if (e.target.value) p.set('type', e.target.value)
                  else p.delete('type')
                  return p
                })
              }
              className={SELECT}
            >
              <option value="">모든 유형</option>
              {types?.types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {typeId && categories.length > 0 && (
              <select
                aria-label="카테고리"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className={SELECT}
              >
                <option value="">모든 카테고리</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
            {tags.length > 0 && (
              <select
                aria-label="태그"
                value={tagId}
                onChange={(e) => setTagId(e.target.value)}
                className={SELECT}
              >
                <option value="">모든 태그</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {editable && selected.length > 0 && (
            <div
              className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm"
              role="region"
              aria-label="고른 콘텐츠"
            >
              <span className="font-medium text-slate-700">{selected.length}개 고름</span>
              {view === 'trash' ? (
                <Button type="button" size="sm" variant="secondary" onClick={() => runBulk('restore')}>
                  되살리기
                </Button>
              ) : (
                <>
                  <Button type="button" size="sm" variant="secondary" onClick={() => runBulk('publish')}>
                    공개
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => runBulk('draft')}>
                    초안으로
                  </Button>
                  <Button type="button" size="sm" variant="danger" onClick={() => runBulk('trash')}>
                    휴지통으로
                  </Button>
                </>
              )}
            </div>
          )}

          {isLoading ? (
            <ul className="space-y-2">
              {[0, 1, 2].map((i) => (
                <li key={i} className="h-16 animate-pulse rounded-lg border border-slate-200 bg-white" />
              ))}
            </ul>
          ) : isError || !data ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              콘텐츠를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
            </div>
          ) : items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
              {view === 'trash' ? '휴지통이 비어 있어요.' : '조건에 맞는 콘텐츠가 없어요.'}
            </p>
          ) : (
            <ItemList
              items={items}
              typeId={typeId}
              sortable={sortable}
              editable={editable}
              trash={view === 'trash'}
              selected={selected}
              onToggle={(id) =>
                setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
              }
              onToggleAll={() =>
                setSelected((s) => (s.length === items.length ? [] : items.map((i) => i.id)))
              }
            />
          )}

          {data && !ordering && lastPage > 1 && (
            <nav className="flex items-center justify-center gap-2 text-sm" aria-label="쪽 이동">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                이전
              </Button>
              <span className="text-slate-600">
                {page} / {lastPage}
              </span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={page >= lastPage}
                onClick={() => setPage((p) => p + 1)}
              >
                다음
              </Button>
            </nav>
          )}
          {editable && typeId && !ordering && view === 'all' && (
            <p className="text-xs text-slate-400">검색 · 필터를 지우면 끌어서 순서를 바꿀 수 있어요.</p>
          )}
          {editable && !typeId && view === 'all' && (
            <p className="text-xs text-slate-400">유형을 고르면 끌어서 순서를 바꿀 수 있어요.</p>
          )}
        </>
      )}
    </div>
  )
}

interface ItemListProps {
  items: ContentItem[]
  typeId: string
  sortable: boolean
  editable: boolean
  trash: boolean
  selected: string[]
  onToggle: (id: string) => void
  onToggleAll: () => void
}

function ItemList({ items, typeId, sortable, editable, trash, selected, onToggle, onToggleAll }: ItemListProps) {
  const reorder = useReorderContentItems()
  const [order, setOrder] = useState<string[] | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  useEffect(() => setOrder(null), [items])
  const byId = new Map(items.map((i) => [i.id, i]))
  const shown = order ? order.map((id) => byId.get(id)).filter((i): i is ContentItem => !!i) : items

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const ids = shown.map((i) => i.id)
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
    setOrder(next)
    reorder.mutate(
      { type_id: typeId, ids: next },
      {
        onError: () => {
          setOrder(null)
          toast.error('순서를 바꾸지 못했어요. 다시 시도해 주세요.')
        },
      }
    )
  }

  return (
    <div className="space-y-2">
      {editable && (
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={selected.length === items.length}
            onChange={onToggleAll}
          />
          이 쪽 모두 고르기
        </label>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={shown.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2" aria-label="콘텐츠 목록">
            {shown.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                sortable={sortable}
                editable={editable}
                trash={trash}
                checked={selected.includes(item.id)}
                onToggle={() => onToggle(item.id)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  )
}

interface ItemRowProps {
  item: ContentItem
  sortable: boolean
  editable: boolean
  trash: boolean
  checked: boolean
  onToggle: () => void
}

function ItemRow({ item, sortable, editable, trash, checked, onToggle }: ItemRowProps) {
  const update = useUpdateContentItem()
  const duplicate = useDuplicateContentItem()
  const remove = useDeleteContentItem()
  const [confirming, setConfirming] = useState(false)
  const usage = useContentUsage('items', confirming ? item.id : null).data ?? []
  const restore = useRestoreContentItem()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !sortable,
  })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const published = item.status === 'PUBLISHED'
  const fail = (fallback: string) => (err: unknown) => toast.error(pickErrorMessage(err, fallback))

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 ${
        isDragging ? 'shadow-lg' : ''
      }`}
    >
      {editable && (
        <input type="checkbox" aria-label={`${item.title} 고르기`} checked={checked} onChange={onToggle} />
      )}
      {sortable && (
        <button
          type="button"
          className="cursor-grab text-slate-400 hover:text-slate-600"
          aria-label={`${item.title} 순서 바꾸기`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      {item.thumbnail_url && (
        <img src={item.thumbnail_url} alt="" className="h-10 w-10 rounded object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {trash ? (
            <span className="truncate font-medium text-slate-700">{item.title}</span>
          ) : (
            <Link
              to={`/admin/contents/${item.id}`}
              className="truncate font-medium text-slate-900 hover:text-blue-700"
            >
              {item.title}
            </Link>
          )}
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] ${
              published ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {published ? '공개' : '초안'}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          {item.type.name}
          {item.category_name && ` · ${item.category_name}`}
          {item.tags.length > 0 && ` · ${item.tags.map((t) => `#${t.name}`).join(' ')}`} · 수정{' '}
          {dayjs(item.updated_at).format('YYYY.MM.DD')}
        </p>
      </div>
      {editable && (
        <div className="flex items-center gap-1">
          {trash ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              loading={restore.isPending}
              onClick={() =>
                restore.mutate(item.id, {
                  onSuccess: () => toast.success(`'${item.title}'을(를) 되살렸어요.`),
                  onError: fail('되살리지 못했어요.'),
                })
              }
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              복구
            </Button>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                loading={update.isPending}
                onClick={() =>
                  update.mutate(
                    { id: item.id, status: published ? 'DRAFT' : 'PUBLISHED' },
                    {
                      onSuccess: () =>
                        toast.success(published ? '초안으로 돌렸어요.' : '공개했어요.'),
                      onError: fail(published ? '초안으로 돌리지 못했어요.' : '공개하지 못했어요.'),
                    }
                  )
                }
              >
                {published ? '초안으로' : '공개'}
              </Button>
              <button
                type="button"
                className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label={`${item.title} 복제`}
                onClick={() =>
                  duplicate.mutate(item.id, {
                    onSuccess: () => toast.success('초안으로 복제했어요.'),
                    onError: fail('복제하지 못했어요.'),
                  })
                }
              >
                <Copy className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="rounded p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                aria-label={`${item.title} 휴지통으로`}
                onClick={() => setConfirming(true)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      )}
      <Modal open={confirming} onClose={() => setConfirming(false)} title="휴지통으로 옮길까요?" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            <strong className="text-slate-900">{item.title}</strong>을(를) 휴지통으로 옮기면
            홈페이지에서 바로 빠져요. 휴지통에서 되살릴 수 있어요.
          </p>
          {usage.length > 0 && (
            <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800" role="note">
              <p>이 콘텐츠가 보이는 곳</p>
              <UsageList usage={usage} />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
              취소
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={remove.isPending}
              onClick={() =>
                remove.mutate(item.id, {
                  onSuccess: () => {
                    toast.success('휴지통으로 옮겼어요.')
                    setConfirming(false)
                  },
                  onError: fail('휴지통으로 옮기지 못했어요.'),
                })
              }
            >
              휴지통으로
            </Button>
          </div>
        </div>
      </Modal>
    </li>
  )
}
