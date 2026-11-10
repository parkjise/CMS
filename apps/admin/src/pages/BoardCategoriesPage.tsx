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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, Merge, Pencil, Trash2 } from 'lucide-react'
import { useParams } from 'react-router'
import type { BoardCategory } from '@cms/types'
import { Button, Input, Modal, toast } from '@cms/ui'
import { BulkMergeCategoriesDialog } from '@/components/boards/BulkMergeCategoriesDialog'
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
import { categoryLabel, childrenOf, isChild, moveAmongSiblings, orderTree } from '@/lib/categoryTree'
import { pickErrorMessage } from '@/lib/errorMessages'

const MAX_CATEGORIES = 30
const NAME_MAX = 30
const iconButton = 'rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30'
const selectClass = 'h-10 rounded-md border border-slate-300 bg-white px-3 text-sm'

interface ParentSelectProps {
  id?: string
  value: string
  /** 상위로 고를 수 있는 1단계 분류 */
  options: BoardCategory[]
  disabled?: boolean
  onChange: (value: string) => void
  className?: string
}

/** 상위 카테고리 고르기 (T-179) — 비우면 1단계 */
function ParentSelect({ id, value, options, disabled, onChange, className }: ParentSelectProps) {
  return (
    <select
      id={id}
      aria-label="상위 카테고리"
      className={className ?? selectClass}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">없음 (1단계)</option>
      {options.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  )
}

interface CategoryRowProps {
  boardId: string
  category: BoardCategory
  /** 같은 게시판의 전체 분류 — 상위 이름 · 하위 여부 */
  categories: BoardCategory[]
  /** 형제 안에서의 위치 · 형제 수 */
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
  categories,
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
  const [parentId, setParentId] = useState(category.parent_id ?? '')
  const child = isChild(category, categories)
  const children = childrenOf(category, categories)
  // 하위가 있으면 다른 분류 아래로 옮길 수 없다 — 2단계까지만
  const parentOptions = categories.filter((c) => c.id !== category.id && !isChild(c, categories))

  const save = (
    payload: { name?: string; is_active?: boolean; parent_id?: string | null },
    done?: () => void
  ) =>
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
    const payload: { name?: string; parent_id?: string | null } = {}
    if (trimmed !== category.name) payload.name = trimmed
    if (parentId !== (category.parent_id ?? '')) payload.parent_id = parentId || null
    if (Object.keys(payload).length === 0) {
      setEditing(false)
      return
    }
    save(payload, () => setEditing(false))
  }

  const cancel = () => {
    setName(category.name)
    setParentId(category.parent_id ?? '')
    setEditing(false)
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 bg-white p-3 ${child ? 'pl-10' : ''}`}
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
          className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
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
          <ParentSelect
            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
            value={parentId}
            options={parentOptions}
            disabled={children.length > 0}
            onChange={setParentId}
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
            onClick={cancel}
          >
            취소
          </Button>
          {children.length > 0 && (
            <p className="w-full text-xs text-slate-500">
              하위 카테고리가 있어 다른 카테고리 아래로 옮길 수 없습니다.
            </p>
          )}
        </form>
      ) : (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">
            {child && (
              <span className="mr-1 text-slate-400" aria-hidden>
                ↳
              </span>
            )}
            {category.name}
            {!category.is_active && (
              <span className="ml-1.5 text-xs text-slate-500">홈페이지에서 숨김</span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            글 {category.post_count.toLocaleString()}개
            {children.length > 0 && ` · 하위 ${children.length}개`}
            {child && <span className="sr-only"> · {categoryLabel(category, categories)}</span>}
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
            title="이름 · 상위 카테고리 바꾸기"
            className={iconButton}
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`${category.name} 합치기`}
            className={iconButton}
            disabled={categories.length < 2 || children.length > 0}
            onClick={onMerge}
            title={
              children.length > 0
                ? '하위 카테고리가 있어 합칠 수 없습니다'
                : '다른 카테고리에 합치기'
            }
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
  const children = target ? childrenOf(target, categories) : []

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
      {target && children.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            &lsquo;{target.name}&rsquo; 아래에 하위 카테고리 {children.length}개(
            {children.map((c) => c.name).join(', ')})가 있어 삭제할 수 없습니다. 하위
            카테고리를 먼저 다른 곳으로 옮기거나 삭제해 주세요.
          </p>
          <div className="flex justify-end">
            <Button type="button" variant="ghost" onClick={onClose}>
              닫기
            </Button>
          </div>
        </div>
      )}
      {target && children.length === 0 && (
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
                    {categoryLabel(c, categories)}
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

interface AddCategoryFormProps {
  boardId: string
  atLimit: boolean
  /** 상위로 고를 수 있는 1단계 분류 */
  parents: BoardCategory[]
}

function AddCategoryForm({ boardId, atLimit, parents }: AddCategoryFormProps) {
  const createCategory = useCreateCategory(boardId)
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  // 고른 상위가 지워지면 1단계로
  const parent = parents.some((c) => c.id === parentId) ? parentId : ''

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    createCategory.mutate(
      { name: trimmed, ...(parent ? { parent_id: parent } : {}) },
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
      className="flex flex-wrap items-end gap-2"
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
      {parents.length > 0 && (
        <label className="block text-sm" htmlFor="new-category-parent">
          <span className="mb-1.5 block font-medium text-slate-700">상위 카테고리</span>
          <ParentSelect
            id="new-category-parent"
            value={parent}
            options={parents}
            disabled={atLimit}
            onChange={setParentId}
          />
        </label>
      )}
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
  const [bulkMerging, setBulkMerging] = useState(false)
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
    if (categoriesQuery.data) setCategories(orderTree(categoriesQuery.data))
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
    const next = moveAmongSiblings(categories, String(active.id), String(over.id))
    if (next) applyOrder(next)
    else toast.error('같은 상위 카테고리 안에서만 순서를 바꿀 수 있습니다.')
  }

  /** 형제 목록 — 위아래 버튼은 형제 안에서만 움직인다 */
  const siblingsOf = (category: BoardCategory) =>
    categories.filter((c) => (c.parent_id ?? null) === (category.parent_id ?? null))
  const parents = categories.filter((c) => !isChild(c, categories))

  if (categoriesQuery.isLoading) {
    return <div className="h-40 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
  }
  if (categoriesQuery.isError)
    return <p className="text-sm text-red-600">카테고리를 불러오지 못했습니다.</p>

  return (
    <div className="max-w-4xl space-y-4">
      <p className="text-sm text-slate-500">
        글을 분류로 나눕니다. 홈페이지 글 목록 위에 &lsquo;전체&rsquo;와 함께 분류 탭이 나타납니다.
        숨긴 분류는 탭에서만 빠지고, 글은 &lsquo;전체&rsquo;에 그대로 보입니다. 상위 카테고리를
        고르면 2단계(예: 진료 › 임플란트)로 나눌 수 있고, 상위를 고르면 하위의 글도 함께 보입니다.
      </p>
      {canEdit && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <AddCategoryForm
            boardId={boardId}
            atLimit={categories.length >= MAX_CATEGORIES}
            parents={parents}
          />
        </div>
      )}
      {canEdit && (
        <div>
          <Button
            type="button"
            variant="secondary"
            disabled={categories.length < 3}
            onClick={() => setBulkMerging(true)}
          >
            여러 카테고리 합치기
          </Button>
          {categories.length < 3 && (
            <p className="mt-1 text-xs text-slate-500">
              원본 2개와 대상 1개, 최소 3개의 카테고리가 필요합니다.
            </p>
          )}
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
                  <ul className="divide-y divide-slate-100" aria-label="카테고리 목록">
                    {visibleCategories.map((category) => {
                      const siblings = siblingsOf(category)
                      const index = siblings.findIndex((c) => c.id === category.id)
                      return (
                        <CategoryRow
                          key={category.id}
                          boardId={boardId}
                          category={category}
                          categories={categories}
                          index={index}
                          count={siblings.length}
                          canEdit={canEdit}
                          canReorder={canReorder}
                          onMove={(delta) => {
                            const next = moveAmongSiblings(
                              categories,
                              category.id,
                              siblings[index + delta].id
                            )
                            if (next) applyOrder(next)
                          }}
                          onDelete={() => setDeleting(category)}
                          onMerge={() => setMerging(category)}
                        />
                      )
                    })}
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
      {bulkMerging && (
        <BulkMergeCategoriesDialog
          boardId={boardId}
          categories={categories}
          onClose={() => setBulkMerging(false)}
        />
      )}
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
    <div className="mx-auto w-full max-w-[1480px] space-y-6 p-6 md:p-8">
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
