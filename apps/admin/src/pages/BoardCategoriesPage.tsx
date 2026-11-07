import { useEffect, useState } from 'react'
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
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, Merge, Pencil, Trash2 } from 'lucide-react'
import { useParams } from 'react-router'
import type { BoardCategory } from '@cms/types'
import { Button, Input, Modal, toast } from '@cms/ui'
import { MergeCategoryDialog } from '@/components/boards/MergeCategoryDialog'
import { BoardDetailHeader } from '@/components/boards/BoardDetailHeader'
import { useBoards } from '@/hooks/useBoards'
import {
  useBoardCategories,
  useCreateCategory,
  useDeleteCategory,
  useReorderCategories,
  useUpdateCategory,
} from '@/hooks/useBoardCategories'
import { useCanEdit } from '@/hooks/useCanEdit'
import { pickErrorMessage } from '@/lib/errorMessages'

const MAX_CATEGORIES = 30
const NAME_MAX = 30
const iconButton = 'rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30'

interface CategoryRowProps {
  boardId: string
  category: BoardCategory
  index: number
  count: number
  canEdit: boolean
  canReorder: boolean
  onMove: (delta: -1 | 1) => void
  onDelete: () => void
  onMerge: () => void
}

function CategoryRow({
  boardId,
  category,
  index,
  count,
  canEdit,
  canReorder,
  onMove,
  onDelete,
  onMerge,
}: CategoryRowProps) {
  const updateCategory = useUpdateCategory(boardId)
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: category.id,
    disabled: !canReorder,
  })
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)

  const save = (payload: { name?: string; is_active?: boolean }, done?: () => void) =>
    updateCategory.mutate(
      { id: category.id, payload },
      {
        onSuccess: () => {
          toast.success('저장했습니다.')
          done?.()
        },
        onError: (error) => toast.error(pickErrorMessage(error, '저장하지 못했습니다.')),
      }
    )

  const rename = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (trimmed === category.name) {
      setEditing(false)
      return
    }
    save({ name: trimmed }, () => setEditing(false))
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-2 bg-white p-3"
    >
      {canEdit && (
        <button
          type="button"
          aria-label={`${category.name} 순서 끌기`}
          disabled={!canReorder}
          className="cursor-grab rounded p-1 text-slate-400 hover:bg-slate-100"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
      )}
      {editing ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            rename()
          }}
        >
          <input
            aria-label="카테고리 이름"
            className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm"
            maxLength={NAME_MAX}
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            type="submit"
            size="sm"
            loading={updateCategory.isPending}
            disabled={!name.trim()}
          >
            저장
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setName(category.name)
              setEditing(false)
            }}
          >
            취소
          </Button>
        </form>
      ) : (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">
            {category.name}
            {!category.is_active && (
              <span className="ml-1.5 text-xs text-slate-500">홈페이지에서 숨김</span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            글 {category.post_count.toLocaleString()}개
          </p>
        </div>
      )}
      {canEdit && !editing && (
        <div className="flex items-center">
          <button
            type="button"
            aria-label={`${category.name} 위로`}
            disabled={!canReorder || index === 0}
            className={iconButton}
            onClick={() => onMove(-1)}
          >
            <ArrowUp className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`${category.name} 아래로`}
            disabled={!canReorder || index === count - 1}
            className={iconButton}
            onClick={() => onMove(1)}
          >
            <ArrowDown className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={category.is_active ? `${category.name} 숨기기` : `${category.name} 보이기`}
            className={iconButton}
            disabled={updateCategory.isPending}
            onClick={() => save({ is_active: !category.is_active })}
          >
            {category.is_active ? (
              <Eye className="h-4 w-4" aria-hidden />
            ) : (
              <EyeOff className="h-4 w-4" aria-hidden />
            )}
          </button>
          <button
            type="button"
            aria-label={`${category.name} 이름 바꾸기`}
            className={iconButton}
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`${category.name} 합치기`}
            className={iconButton}
            disabled={count < 2}
            onClick={onMerge}
            title="다른 카테고리에 합치기"
          >
            <Merge className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`${category.name} 삭제`}
            className={iconButton}
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </li>
  )
}

interface DeleteDialogProps {
  boardId: string
  target: BoardCategory | null
  categories: BoardCategory[]
  onClose: () => void
}

/** 삭제 — 글이 있으면 옮길 분류를 고른다 (기획안 BRD-005 운영 정책) */
function DeleteDialog({ boardId, target, categories, onClose }: DeleteDialogProps) {
  const deleteCategory = useDeleteCategory(boardId)
  const [moveTo, setMoveTo] = useState('')
  const others = categories.filter((c) => c.id !== target?.id)

  const submit = () => {
    if (!target) return
    deleteCategory.mutate(
      { id: target.id, moveTo: moveTo || null },
      {
        onSuccess: (moved) => {
          toast.success(
            moved > 0 ? `삭제하고 글 ${moved.toLocaleString()}개를 옮겼습니다.` : '삭제했습니다.'
          )
          onClose()
        },
        onError: (error) => toast.error(pickErrorMessage(error, '삭제하지 못했습니다.')),
      }
    )
  }

  return (
    <Modal open={target !== null} onClose={onClose} title="카테고리 삭제" size="sm">
      {target && (
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            &lsquo;{target.name}&rsquo; 카테고리를 삭제합니다.
            {target.post_count > 0
              ? ` 이 카테고리의 글 ${target.post_count.toLocaleString()}개는 아래에서 고른 곳으로 옮깁니다. 휴지통의 글도 함께 옮깁니다.`
              : ' 휴지통에 있는 글이 있으면 분류 없음으로 바뀝니다.'}
          </p>
          {target.post_count > 0 && (
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-slate-700">글을 옮길 곳</span>
              <select
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                value={moveTo}
                onChange={(e) => setMoveTo(e.target.value)}
              >
                <option value="">분류 없음</option>
                {others.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              취소
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={deleteCategory.isPending}
              onClick={submit}
            >
              삭제
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function AddCategoryForm({ boardId, atLimit }: { boardId: string; atLimit: boolean }) {
  const createCategory = useCreateCategory(boardId)
  const [name, setName] = useState('')

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    createCategory.mutate(
      { name: trimmed },
      {
        onSuccess: () => {
          setName('')
          toast.success('카테고리를 추가했습니다.')
        },
        onError: (error) => toast.error(pickErrorMessage(error, '추가하지 못했습니다.')),
      }
    )
  }

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="min-w-0 flex-1">
        <Input
          label="새 카테고리"
          placeholder="예: 공지, 이벤트, 채용"
          maxLength={NAME_MAX}
          value={name}
          disabled={atLimit}
          helperText={
            atLimit ? `카테고리는 게시판당 ${MAX_CATEGORIES}개까지 만들 수 있습니다.` : undefined
          }
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <Button type="submit" loading={createCategory.isPending} disabled={atLimit || !name.trim()}>
        추가
      </Button>
    </form>
  )
}

function CategoryManager({ boardId }: { boardId: string }) {
  const canEdit = useCanEdit()
  const categoriesQuery = useBoardCategories(boardId)
  const reorder = useReorderCategories(boardId)
  const [categories, setCategories] = useState<BoardCategory[]>([])
  const [deleting, setDeleting] = useState<BoardCategory | null>(null)
  const [merging, setMerging] = useState<BoardCategory | null>(null)
  const [search, setSearch] = useState('')
  const [visibility, setVisibility] = useState('all')
  const query = search.trim().toLocaleLowerCase()
  const filtering = query !== '' || visibility !== 'all'
  const canReorder = canEdit && !filtering
  const visibleCategories = categories.filter(
    (category) =>
      category.name.toLocaleLowerCase().includes(query) &&
      (visibility === 'all' || category.is_active === (visibility === 'visible'))
  )

  useEffect(() => {
    if (categoriesQuery.data) setCategories(categoriesQuery.data)
  }, [categoriesQuery.data])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const applyOrder = (next: BoardCategory[]) => {
    if (!canReorder) return
    setCategories(next)
    reorder.mutate(
      next.map((c) => c.id),
      { onError: (error) => toast.error(pickErrorMessage(error, '순서를 바꾸지 못했습니다.')) }
    )
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!canReorder || !over || active.id === over.id) return
    const from = categories.findIndex((c) => c.id === active.id)
    const to = categories.findIndex((c) => c.id === over.id)
    applyOrder(arrayMove(categories, from, to))
  }

  if (categoriesQuery.isLoading) {
    return <div className="h-40 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
  }
  if (categoriesQuery.isError)
    return <p className="text-sm text-red-600">카테고리를 불러오지 못했습니다.</p>

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <p className="text-sm text-slate-500">
        글을 분류로 나눕니다. 홈페이지 글 목록 위에 &lsquo;전체&rsquo;와 함께 분류 탭이 나타납니다.
        숨긴 분류는 탭에서만 빠지고, 글은 &lsquo;전체&rsquo;에 그대로 보입니다.
      </p>
      {canEdit && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <AddCategoryForm boardId={boardId} atLimit={categories.length >= MAX_CATEGORIES} />
        </div>
      )}
      {categories.length > 0 ? (
        <>
          <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <Input
                  label="카테고리 이름 검색"
                  type="search"
                  placeholder="이름 일부 입력"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-slate-700">홈페이지 표시</span>
                <select
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value)}
                >
                  <option value="all">전체</option>
                  <option value="visible">표시</option>
                  <option value="hidden">숨김</option>
                </select>
              </label>
              <Button
                type="button"
                variant="ghost"
                disabled={!search && visibility === 'all'}
                onClick={() => {
                  setSearch('')
                  setVisibility('all')
                }}
              >
                검색 초기화
              </Button>
            </div>
            <p className="text-sm text-slate-500" role="status">
              전체 {categories.length}개 · 검색 결과 {visibleCategories.length}개
            </p>
            {canEdit && filtering && (
              <p className="text-xs text-slate-500">순서를 바꾸려면 검색 조건을 초기화해 주세요.</p>
            )}
          </div>
          {visibleCategories.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-slate-200 shadow-sm">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={visibleCategories.map((c) => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="divide-y divide-slate-100">
                    {visibleCategories.map((category) => (
                      <CategoryRow
                        key={category.id}
                        boardId={boardId}
                        category={category}
                        index={categories.findIndex((c) => c.id === category.id)}
                        count={categories.length}
                        canEdit={canEdit}
                        canReorder={canReorder}
                        onMove={(delta) => {
                          const index = categories.findIndex((c) => c.id === category.id)
                          applyOrder(arrayMove(categories, index, index + delta))
                        }}
                        onDelete={() => setDeleting(category)}
                        onMerge={() => setMerging(category)}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
              검색 조건에 맞는 카테고리가 없습니다. 검색 조건을 변경하거나 초기화해 주세요.
            </p>
          )}
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
          아직 카테고리가 없습니다. 카테고리가 없으면 홈페이지에 분류 탭이 나오지 않습니다.
        </p>
      )}
      <DeleteDialog
        boardId={boardId}
        target={deleting}
        categories={categories}
        onClose={() => setDeleting(null)}
      />
      {merging && (
        <MergeCategoryDialog
          key={merging.id}
          boardId={boardId}
          source={merging}
          categories={categories}
          onClose={() => setMerging(null)}
        />
      )}
    </div>
  )
}

/** 카테고리 관리 (BM-09, T-149) */
export function BoardCategoriesPage() {
  const { boardId = '' } = useParams()
  const boardsQuery = useBoards()
  const board = boardsQuery.data?.find((b) => b.id === boardId)

  return (
    <div className="space-y-5 p-6 md:p-8">
      <BoardDetailHeader boardId={boardId} />
      {boardsQuery.isSuccess && !board && (
        <p className="text-sm text-slate-500">게시판을 찾을 수 없습니다.</p>
      )}
      {board?.system_key && (
        <p className="text-sm text-slate-500">기본 게시판에는 카테고리를 만들 수 없습니다.</p>
      )}
      {board && !board.system_key && <CategoryManager key={boardId} boardId={boardId} />}
    </div>
  )
}
