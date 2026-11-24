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
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Copy, FileText, GripVertical, Lock, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Button, Modal, toast } from '@cms/ui'
import { AddPageModal } from '@/components/pages/AddPageModal'
import { useCanEdit } from '@/hooks/useCanEdit'
import {
  type Page,
  type PageLimits,
  useDeletePage,
  usePages,
  useReorderPages,
  useRestorePage,
} from '@/hooks/usePages'
import { pickErrorMessage } from '@/lib/errorMessages'
import { pagePath } from '@/lib/pageKey'

type Tab = 'pages' | 'trash'
type OriginFilter = 'all' | 'TEMPLATE' | 'CUSTOM'
type StatusFilter = 'all' | 'public' | 'hidden'

const SELECT =
  'h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 sm:flex-none'

/** 페이지 관리 (T-238, 기획서 PM-01) — 기본 페이지 + 직접 만든 페이지, 휴지통 */
export function PagesPage() {
  const navigate = useNavigate()
  const canEdit = useCanEdit()
  const { data, isLoading, isError } = usePages()
  const [tab, setTab] = useState<Tab>('pages')
  const [query, setQuery] = useState('')
  const [origin, setOrigin] = useState<OriginFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [adding, setAdding] = useState(false)
  const [copyFrom, setCopyFrom] = useState<Page | null>(null)
  const [deleting, setDeleting] = useState<Page | null>(null)

  const pages = useMemo(() => data?.pages ?? [], [data])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return pages.filter(
      (p) =>
        (!q || p.title.toLowerCase().includes(q) || p.page_key.includes(q)) &&
        (origin === 'all' || p.origin === origin) &&
        (status === 'all' || (status === 'public') === p.is_public)
    )
  }, [pages, query, origin, status])
  const filtering = filtered.length !== pages.length
  const enabled = data?.enabled ?? false
  const editable = enabled && canEdit
  const customCount = pages.filter((p) => p.origin === 'CUSTOM').length

  const openAdd = (from: Page | null) => {
    setCopyFrom(from)
    setAdding(true)
  }

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">페이지 관리</h1>
          <p className="mt-1 text-sm text-slate-500">
            홈페이지의 페이지와 각 페이지의 섹션을 관리합니다.
            {enabled && ' 필요한 페이지를 직접 추가할 수 있어요.'}
          </p>
        </div>
        {editable && data && <AddBar limits={data.limits} onAdd={() => openAdd(null)} />}
      </div>

      {enabled && (
        <div
          role="tablist"
          aria-label="페이지 보기"
          className="flex gap-1 border-b border-slate-200"
        >
          {(
            [
              ['pages', `페이지 ${pages.length}`],
              ['trash', `휴지통 ${data?.trash.length ?? 0}`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                tab === value
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <ul className="space-y-2">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="h-16 animate-pulse rounded-lg border border-slate-200 bg-white"
            />
          ))}
        </ul>
      ) : isError || !data ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          페이지 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
        </div>
      ) : tab === 'trash' ? (
        <TrashList pages={data.trash} canRestore={editable} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              aria-label="페이지 검색"
              placeholder="페이지 이름 · 주소 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm sm:w-auto sm:min-w-0 sm:max-w-xs sm:flex-1"
            />
            <select
              aria-label="구분"
              value={origin}
              onChange={(e) => setOrigin(e.target.value as OriginFilter)}
              className={SELECT}
            >
              <option value="all">전체 구분</option>
              <option value="TEMPLATE">기본 페이지</option>
              <option value="CUSTOM">직접 만든 페이지</option>
            </select>
            <select
              aria-label="공개 상태"
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className={SELECT}
            >
              <option value="all">전체 상태</option>
              <option value="public">공개</option>
              <option value="hidden">숨김</option>
            </select>
          </div>

          <PageList
            pages={filtered}
            sortable={editable && !filtering}
            onOpen={(page) => navigate(`/admin/pages/${page.page_key}`)}
            onCopy={editable && data.limits.can_create ? (page) => openAdd(page) : undefined}
            onDelete={editable ? setDeleting : undefined}
          />
          {filtering && filtered.length === 0 && (
            <p className="text-sm text-slate-500">조건에 맞는 페이지가 없어요.</p>
          )}
          {editable && customCount === 0 && !filtering && (
            <EmptyCustom canCreate={data.limits.can_create} onAdd={() => openAdd(null)} />
          )}
          {editable && filtering && (
            <p className="text-xs text-slate-400">
              검색 · 필터를 지우면 끌어서 순서를 바꿀 수 있어요.
            </p>
          )}
        </>
      )}

      {data && (
        <AddPageModal
          open={adding}
          pages={pages}
          copyFrom={copyFrom}
          onClose={() => setAdding(false)}
          onCreated={(page) => {
            setAdding(false)
            navigate(`/admin/pages/${page.page_key}`)
          }}
        />
      )}
      <DeletePageDialog page={deleting} onClose={() => setDeleting(null)} />
    </div>
  )
}

function AddBar({ limits, onAdd }: { limits: PageLimits; onAdd: () => void }) {
  const usage = limits.limit === null ? `${limits.used}개` : `${limits.used} / ${limits.limit}`
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-500">직접 만든 페이지 {usage}</span>
        <Button type="button" onClick={onAdd} disabled={!limits.can_create}>
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
          페이지 추가
        </Button>
      </div>
      {limits.reason && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500" role="note">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          {limits.reason}
        </p>
      )}
    </div>
  )
}

function EmptyCustom({ canCreate, onAdd }: { canCreate: boolean; onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-300 p-8 text-center">
      <FileText className="h-8 w-8 text-slate-300" aria-hidden="true" />
      <div>
        <p className="font-medium text-slate-900">아직 직접 만든 페이지가 없어요</p>
        <p className="mt-1 text-sm text-slate-500">
          이벤트 · 의료진 소개처럼 필요한 페이지를 추가해 보세요.
        </p>
      </div>
      {canCreate && (
        <Button type="button" variant="secondary" onClick={onAdd}>
          첫 페이지 만들기
        </Button>
      )}
    </div>
  )
}

interface PageListProps {
  pages: Page[]
  sortable: boolean
  onOpen: (page: Page) => void
  onCopy?: (page: Page) => void
  onDelete?: (page: Page) => void
}

function PageList({ pages, sortable, onOpen, onCopy, onDelete }: PageListProps) {
  const reorder = useReorderPages()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = pages.findIndex((p) => p.id === active.id)
    const to = pages.findIndex((p) => p.id === over.id)
    if (from === -1 || to === -1) return
    reorder.mutate(
      arrayMove(pages, from, to).map((p) => p.id),
      { onError: () => toast.error('순서를 바꾸지 못했어요. 다시 시도해 주세요.') }
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={pages.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2" aria-label="페이지 목록">
          {pages.map((page) => (
            <PageRow
              key={page.id}
              page={page}
              sortable={sortable && page.page_key !== 'home'}
              onOpen={onOpen}
              onCopy={onCopy}
              onDelete={page.origin === 'CUSTOM' ? onDelete : undefined}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

interface PageRowProps {
  page: Page
  sortable: boolean
  onOpen: (page: Page) => void
  onCopy?: (page: Page) => void
  onDelete?: (page: Page) => void
}

function PageRow({ page, sortable, onOpen, onCopy, onDelete }: PageRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
    disabled: !sortable,
  })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 ${
        isDragging ? 'shadow-lg' : ''
      } ${page.parent_key ? 'ml-6' : ''}`}
    >
      {sortable ? (
        <button
          type="button"
          className="cursor-grab text-slate-400 hover:text-slate-600"
          aria-label={`${page.title} 순서 바꾸기`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : (
        <span className="w-4" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/admin/pages/${page.page_key}`}
            className="truncate font-medium text-slate-900 hover:text-blue-700"
          >
            {page.parent_key && <span className="mr-1 text-slate-400">└</span>}
            {page.title}
          </Link>
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] ${
              page.origin === 'CUSTOM' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {page.origin === 'CUSTOM' ? '직접' : '기본'}
          </span>
          {!page.is_public && (
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">
              숨김
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          {pagePath(page.page_key)} · 섹션 {page.section_count}개
          {page.origin === 'CUSTOM' && (page.show_in_menu ? ' · 메뉴 표시' : ' · 메뉴에 없음')}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Button type="button" size="sm" variant="secondary" onClick={() => onOpen(page)}>
          편집
        </Button>
        {onCopy && (
          <button
            type="button"
            onClick={() => onCopy(page)}
            className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label={`${page.title} 복제`}
          >
            <Copy className="h-4 w-4" />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(page)}
            className="rounded p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
            aria-label={`${page.title} 휴지통으로`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </li>
  )
}

function TrashList({ pages, canRestore }: { pages: Page[]; canRestore: boolean }) {
  const restore = useRestorePage()
  if (pages.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">
        휴지통이 비어 있어요.
      </div>
    )
  }
  return (
    <ul className="space-y-2" aria-label="휴지통">
      {pages.map((page) => (
        <li
          key={page.id}
          className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium text-slate-700">{page.title}</p>
            <p className="text-xs text-slate-500">
              {pagePath(page.page_key)} · 섹션 {page.section_count}개 함께 보관 중
            </p>
          </div>
          {canRestore && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              loading={restore.isPending && restore.variables === page.id}
              onClick={() =>
                restore.mutate(page.id, {
                  onSuccess: () => toast.success(`'${page.title}' 페이지를 되살렸어요.`),
                  onError: (err) =>
                    toast.error(pickErrorMessage(err, '페이지를 되살리지 못했어요.')),
                })
              }
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              복구
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}

function DeletePageDialog({ page, onClose }: { page: Page | null; onClose: () => void }) {
  const remove = useDeletePage()
  return (
    <Modal open={page !== null} onClose={onClose} title="페이지를 휴지통으로 옮길까요?" size="sm">
      {page && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            <strong className="text-slate-900">{page.title}</strong> 페이지와 섹션{' '}
            {page.section_count}개가 휴지통으로 옮겨지고, 홈페이지 메뉴와 주소(
            {pagePath(page.page_key)})에서 바로 사라져요. 휴지통에서 되살릴 수 있어요.
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
                remove.mutate(page.id, {
                  onSuccess: () => {
                    toast.success(`'${page.title}' 페이지를 휴지통으로 옮겼어요.`)
                    onClose()
                  },
                  onError: (err) => toast.error(pickErrorMessage(err, '페이지를 옮기지 못했어요.')),
                })
              }
            >
              휴지통으로
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
