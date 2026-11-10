import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import {
  CircleCheck,
  CircleHelp,
  ClipboardList,
  Copy,
  ExternalLink,
  FileText,
  Image,
  LayoutGrid,
  List,
  Plus,
  Search,
  Settings,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import type { Board, BoardType } from '@cms/types'
import { toast } from '@cms/ui'
import { BoardExamples } from '@/components/boards/BoardExamples'
import { BoardPageTitle } from '@/components/boards/BoardPageTitle'
import {
  HELP_STRIP,
  ICON_BUTTON,
  INPUT,
  LINK_PRIMARY,
  LIST_CARD,
  PAGE,
  TAG_DEFAULT,
  TAG_GREEN,
  TAG_OFF,
  TD,
  TH,
} from '@/components/boards/boardStyles'
import { useCanEdit } from '@/hooks/useCanEdit'
import { useBoardLimits, useBoards, useDeleteBoard, useDuplicateBoard } from '@/hooks/useBoards'
import { useSiteMenu } from '@/hooks/useSiteSettings'
import { BOARD_TYPES, boardTypeLabel } from '@/lib/boardLabels'
import { pickErrorMessage } from '@/lib/errorMessages'
import { useAuthStore } from '@/stores/authStore'

const CLIENT_BASE_URL = (import.meta.env.VITE_CLIENT_BASE_URL ?? 'http://localhost:3000').replace(
  /\/+$/,
  ''
)
const PAGE_SIZE = 10

const TYPE_ICONS: Record<BoardType, { Icon: LucideIcon; tone: string }> = {
  LIST: { Icon: List, tone: 'bg-slate-100 text-slate-500' },
  GALLERY: { Icon: Image, tone: 'bg-emerald-50 text-emerald-600' },
  FAQ: { Icon: CircleHelp, tone: 'bg-amber-50 text-amber-600' },
  CARD: { Icon: LayoutGrid, tone: 'bg-blue-50 text-blue-600' },
}

const STATUS_TABS = [
  { value: '', label: '전체 게시판' },
  { value: 'ACTIVE', label: '운영 중' },
  { value: 'INACTIVE', label: '비활성' },
] as const

interface StatCardProps {
  label: string
  value: number
  note: string
  Icon: LucideIcon
  tone: string
}

const StatCard = ({ label, value, note, Icon, tone }: StatCardProps) => (
  <div className="relative min-h-[118px] rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <p className="text-xs text-slate-500">{label}</p>
    <span className={`absolute right-5 top-5 hidden rounded-lg p-2 sm:grid ${tone}`}>
      <Icon className="h-[18px] w-[18px]" aria-hidden />
    </span>
    <p className="mt-3 text-[28px] font-bold leading-none tracking-tight text-slate-900">
      {value.toLocaleString()}
      <span className="ml-1 text-xs font-normal text-slate-400">개</span>
    </p>
    <p className="mt-3 text-[11px] text-slate-400">{note}</p>
  </div>
)

/** 게시판 목록 (BM-01, 게시판 모듈 기획서 4장 · UI/UX 시안 v3, T-187) */
export function BoardsPage() {
  const boardsQuery = useBoards()
  const limitsQuery = useBoardLimits()
  const mode = useSiteMenu().data?.mode
  const tenantSlug = useAuthStore((state) => state.tenantSlug)
  const canEdit = useCanEdit()
  const boards = boardsQuery.data
  const limits = limitsQuery.data
  const duplicateBoard = useDuplicateBoard()
  const deleteBoard = useDeleteBoard()
  const [bulkPending, setBulkPending] = useState(false)
  const actionPending = duplicateBoard.isPending || deleteBoard.isPending || bulkPending
  const canDuplicate = Boolean(limits?.can_create) && !limitsQuery.isError
  const navigate = useNavigate()
  const [selected, setSelected] = useState<string[]>([])
  const [page, setPage] = useState(1)

  const duplicate = async (id: string) => {
    if (!canEdit || actionPending || !canDuplicate) return
    try {
      const copy = await duplicateBoard.mutateAsync(id)
      toast.success('설정과 칸을 복제했습니다. 글은 복제되지 않습니다.')
      navigate(`/admin/boards/${copy.id}/settings`)
    } catch (error) {
      toast.error(pickErrorMessage(error, '복제하지 못했습니다.'))
    }
  }
  const remove = async (board: Board) => {
    if (!canEdit || actionPending || board.system_key !== null) return
    const posts =
      board.post_count > 0
        ? `글 ${board.post_count.toLocaleString()}개도 함께 보이지 않게 되고, `
        : ''
    if (
      !window.confirm(
        `'${board.name}' 을(를) 휴지통으로 옮길까요? ${posts}홈페이지 메뉴와 주소에서 빠집니다.`
      )
    )
      return
    try {
      await deleteBoard.mutateAsync(board.id)
      setSelected((ids) => ids.filter((id) => id !== board.id))
      toast.success('휴지통으로 옮겼습니다.')
    } catch (error) {
      toast.error(pickErrorMessage(error, '삭제하지 못했습니다.'))
    }
  }
  const removeSelected = async () => {
    const targets = (boards ?? []).filter((b) => selected.includes(b.id) && b.system_key === null)
    if (!canEdit || actionPending || targets.length === 0) return
    if (
      !window.confirm(
        `게시판 ${targets.length}개를 휴지통으로 옮길까요? 글도 함께 보이지 않게 되고, 홈페이지 메뉴와 주소에서 빠집니다.`
      )
    )
      return
    setBulkPending(true)
    let moved = 0
    try {
      for (const board of targets) {
        await deleteBoard.mutateAsync(board.id)
        moved += 1
      }
      toast.success(`게시판 ${moved}개를 휴지통으로 옮겼습니다.`)
    } catch (error) {
      toast.error(
        pickErrorMessage(error, moved ? `${moved}개만 옮기고 멈췄습니다.` : '삭제하지 못했습니다.')
      )
    } finally {
      setBulkPending(false)
      setSelected([])
    }
  }

  const [searchParams, setSearchParams] = useSearchParams()
  const nameQuery = searchParams.get('q') ?? ''
  const typeQuery = searchParams.get('type') ?? ''
  const statusQuery = searchParams.get('status') ?? ''
  const selectedType = BOARD_TYPES.some((type) => type.value === typeQuery) ? typeQuery : ''
  const selectedStatus = ['ACTIVE', 'INACTIVE'].includes(statusQuery) ? statusQuery : ''
  const keyword = nameQuery.trim().toLocaleLowerCase()
  // 상태 탭 숫자는 이름 · 유형 조건만 반영한다
  const searched = boards?.filter(
    (board) =>
      (board.name.toLocaleLowerCase().includes(keyword) ||
        board.slug.toLocaleLowerCase().includes(keyword)) &&
      (!selectedType || board.board_type === selectedType)
  )
  const filteredBoards = searched?.filter(
    (board) => !selectedStatus || board.status === selectedStatus
  )
  const lastPage = Math.max(1, Math.ceil((filteredBoards?.length ?? 0) / PAGE_SIZE))
  const currentPage = Math.min(page, lastPage)
  const pageBoards = filteredBoards?.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const selectable = (pageBoards ?? []).filter((board) => board.system_key === null)
  const allSelected = selectable.length > 0 && selectable.every((b) => selected.includes(b.id))

  const updateFilter = (key: string, value: string) => {
    setPage(1)
    setSelected([])
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true }
    )
  }
  const resetFilters = () => {
    setPage(1)
    setSelected([])
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        for (const key of ['q', 'type', 'status']) next.delete(key)
        return next
      },
      { replace: true }
    )
  }
  // 홈페이지의 [글쓰기] → ?write=notice, 글 상세의 [수정] → ?write=notice&post={글 id}
  const writeKey = searchParams.get('write')
  const postKey = searchParams.get('post')

  useEffect(() => {
    const target = boards?.find((b) => b.slug === writeKey)
    if (!target) return
    const screen = postKey ? `${encodeURIComponent(postKey)}/edit` : 'new'
    navigate(`/admin/boards/${target.id}/posts/${screen}`, { replace: true })
  }, [boards, writeKey, postKey, navigate])

  const total = boards?.length ?? 0
  const active = boards?.filter((b) => b.status === 'ACTIVE').length ?? 0
  const postTotal = boards?.reduce((sum, b) => sum + b.post_count, 0) ?? 0
  const statusCount = (value: string) =>
    searched?.filter((b) => !value || b.status === value).length ?? 0

  return (
    <div className={PAGE}>
      <BoardPageTitle
        title="게시판 목록"
        description="사이트의 게시판을 한곳에서 관리하세요. 이름을 누르면 글을, 설정 버튼을 누르면 게시판 설정을 엽니다."
        actions={
          canEdit &&
          limits?.can_create && (
            <Link to="/admin/boards/new" className={LINK_PRIMARY}>
              <Plus className="h-4 w-4" aria-hidden />
              게시판 추가
            </Link>
          )
        }
      />

      {canEdit && limits && !limits.can_create && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          {limits.reason}{' '}
          <Link to="/admin/billing" className="font-medium text-blue-600 underline">
            요금제 보기
          </Link>
        </p>
      )}
      {canEdit && limitsQuery.isError && (
        <p role="alert" className="text-sm text-red-600">
          게시판 한도를 확인하지 못했습니다. 새로고침 후 다시 시도해 주세요.
        </p>
      )}

      {boards && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <StatCard
            label="전체 게시판"
            value={total}
            note="휴지통 제외"
            Icon={ClipboardList}
            tone="bg-blue-50 text-blue-600"
          />
          <StatCard
            label="운영 중"
            value={active}
            note="홈페이지에 공개 중"
            Icon={CircleCheck}
            tone="bg-emerald-50 text-emerald-600"
          />
          <StatCard
            label="전체 게시글"
            value={postTotal}
            note="휴지통 제외"
            Icon={FileText}
            tone="bg-slate-100 text-slate-500"
          />
          <StatCard
            label="비활성"
            value={total - active}
            note="홈페이지에서 숨김"
            Icon={Settings}
            tone="bg-amber-50 text-amber-600"
          />
        </div>
      )}

      {!boardsQuery.isError && boards && !boards.some((board) => board.system_key === null) && (
        <BoardExamples canCreate={canEdit && canDuplicate} />
      )}

      <section aria-label="게시판 목록" className={LIST_CARD}>
        <div
          role="group"
          aria-label="사용 상태"
          className="flex min-h-14 items-end gap-6 overflow-x-auto border-b border-slate-200 px-6"
        >
          {STATUS_TABS.map(({ value, label }) => (
            <button
              key={label}
              type="button"
              aria-pressed={selectedStatus === value}
              onClick={() => updateFilter('status', value)}
              className={[
                '-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-0.5 pb-3.5 pt-4 text-[13px]',
                selectedStatus === value
                  ? 'border-blue-600 font-semibold text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800',
              ].join(' ')}
            >
              {label}
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-slate-500">
                {statusCount(value)}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-200 px-6 py-4">
          <label className="flex h-10 min-w-48 max-w-sm flex-1 basis-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-slate-400 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 sm:basis-auto">
            <Search className="h-4 w-4 shrink-0" aria-hidden />
            <span className="sr-only">게시판 이름</span>
            <input
              type="search"
              value={nameQuery}
              onChange={(event) => updateFilter('q', event.target.value)}
              placeholder="게시판 이름 또는 주소 검색"
              className="h-full w-full border-0 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
          </label>
          <label className="sr-only" htmlFor="board-type-filter">
            게시판 유형
          </label>
          <select
            id="board-type-filter"
            value={selectedType}
            onChange={(event) => updateFilter('type', event.target.value)}
            className={`${INPUT} w-32`}
          >
            <option value="">모든 유형</option>
            {BOARD_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={resetFilters}
            className="h-10 rounded-lg px-3 text-sm text-slate-500 hover:bg-slate-100"
          >
            검색 초기화
          </button>
          <span className="flex-1" />
          {canEdit && (
            <>
              {selected.length > 0 && (
                <span className="text-xs text-slate-500">{selected.length}개 선택</span>
              )}
              <button
                type="button"
                disabled={selected.length === 0 || actionPending}
                onClick={() => void removeSelected()}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                휴지통 이동
              </button>
            </>
          )}
        </div>

        {boardsQuery.isLoading && <div className="m-6 h-20 animate-pulse rounded-lg bg-slate-50" />}
        {boardsQuery.isError && (
          <p className="p-8 text-center text-sm text-red-600">게시판을 불러오지 못했습니다.</p>
        )}
        {boards?.length === 0 && (
          <p className="p-12 text-center text-sm text-slate-500">아직 게시판이 없습니다.</p>
        )}
        {boards && boards.length > 0 && filteredBoards?.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-700">
              검색 조건에 맞는 게시판이 없습니다.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              다른 검색어나 조건으로 다시 확인해 주세요.
            </p>
          </div>
        )}

        {pageBoards && pageBoards.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="border-b border-slate-200">
                <tr>
                  {canEdit && (
                    <th className={`${TH} w-12 pl-6`}>
                      <input
                        type="checkbox"
                        aria-label="이 페이지의 게시판 모두 선택"
                        checked={allSelected}
                        disabled={selectable.length === 0}
                        onChange={() =>
                          setSelected(allSelected ? [] : selectable.map((board) => board.id))
                        }
                        className="h-4 w-4 accent-blue-600"
                      />
                    </th>
                  )}
                  <th className={TH}>게시판 이름 / 주소</th>
                  <th className={TH}>홈페이지</th>
                  <th className={TH}>유형</th>
                  <th className={TH}>게시글</th>
                  <th className={TH}>운영 상태</th>
                  <th className={TH}>설정 수정일</th>
                  <th className={TH}>관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageBoards.map((board) => {
                  const path = board.system_key
                    ? encodeURIComponent(board.system_key)
                    : `b/${encodeURIComponent(board.slug)}`
                  const url = tenantSlug
                    ? `${CLIENT_BASE_URL}/${encodeURIComponent(tenantSlug)}/${path}`
                    : null
                  // 공지는 템플릿을 확인한 뒤에 — 테마형도 /notice 로 열린다 (T-176)
                  const canOpen =
                    url && board.status === 'ACTIVE' && (!board.system_key || mode !== undefined)
                  const modified = board.updated_at ? dayjs(board.updated_at) : null
                  const { Icon, tone } = TYPE_ICONS[board.board_type] ?? TYPE_ICONS.LIST
                  return (
                    <tr key={board.id} className="hover:bg-slate-50/60">
                      {canEdit && (
                        <td className={`${TD} pl-6`}>
                          {board.system_key === null && (
                            <input
                              type="checkbox"
                              aria-label={`${board.name} 선택`}
                              checked={selected.includes(board.id)}
                              onChange={() =>
                                setSelected((ids) =>
                                  ids.includes(board.id)
                                    ? ids.filter((id) => id !== board.id)
                                    : [...ids, board.id]
                                )
                              }
                              className="h-4 w-4 accent-blue-600"
                            />
                          )}
                        </td>
                      )}
                      <td className={TD}>
                        <div className="flex min-w-44 items-center gap-3">
                          <span
                            className={`grid h-10 w-9 shrink-0 place-items-center rounded-lg ${tone}`}
                          >
                            <Icon className="h-[18px] w-[18px]" aria-hidden />
                          </span>
                          <div className="min-w-0">
                            <Link
                              to={`/admin/boards/${board.id}/posts`}
                              className="font-semibold text-slate-800 hover:text-blue-600"
                            >
                              {board.name}
                            </Link>
                            <p className="mt-1 font-mono text-[11px] text-slate-400">
                              {board.slug}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className={`${TD} max-w-56 text-xs text-slate-500`}>
                        {url ? (
                          canOpen ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`${board.name} 홈페이지 (새 창)`}
                              className="inline-flex items-start gap-1 break-all text-blue-600 hover:underline"
                            >
                              <span className="break-all">{url}</span>
                              <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                            </a>
                          ) : (
                            <span className="break-all">주소 {url}</span>
                          )
                        ) : (
                          <span>홈페이지 주소 확인 불가</span>
                        )}
                      </td>
                      <td className={TD}>
                        <span className={TAG_DEFAULT}>{boardTypeLabel(board.board_type)}</span>
                      </td>
                      <td className={TD}>
                        <Link
                          to={`/admin/boards/${board.id}/posts`}
                          aria-label={`${board.name} 글 ${board.post_count.toLocaleString()}개`}
                          className="whitespace-nowrap text-slate-700 hover:text-blue-600"
                        >
                          <strong className="font-semibold">
                            {board.post_count.toLocaleString()}
                          </strong>
                          <span className="text-slate-400"> 건</span>
                        </Link>
                      </td>
                      <td className={TD}>
                        <span className={board.status === 'ACTIVE' ? TAG_GREEN : TAG_OFF}>
                          {board.status === 'ACTIVE' ? '● 운영 중' : '비활성'}
                        </span>
                      </td>
                      <td className={`${TD} whitespace-nowrap text-xs text-slate-500`}>
                        {modified?.isValid() ? (
                          <time dateTime={board.updated_at} title="게시판 설정 수정일">
                            {modified.format('YYYY.MM.DD HH:mm')}
                          </time>
                        ) : (
                          <span>설정 수정일 확인 불가</span>
                        )}
                      </td>
                      <td className={TD}>
                        <div
                          role="group"
                          aria-label={`${board.name} 작업`}
                          className="flex items-center gap-0.5"
                        >
                          <Link
                            to={`/admin/boards/${board.id}/settings`}
                            aria-label={`${board.name} 설정`}
                            title="상세 설정"
                            className={ICON_BUTTON}
                          >
                            <Settings className="h-4 w-4" aria-hidden />
                          </Link>
                          {canEdit && (
                            <button
                              type="button"
                              aria-label={`${board.name} 복제`}
                              title={
                                canDuplicate
                                  ? '설정과 칸만 복제합니다. 글은 복제하지 않습니다.'
                                  : (limits?.reason ??
                                    '게시판 한도를 확인한 뒤 복제할 수 있습니다.')
                              }
                              disabled={actionPending || !canDuplicate}
                              aria-busy={
                                duplicateBoard.isPending && duplicateBoard.variables === board.id
                              }
                              onClick={() => void duplicate(board.id)}
                              className={ICON_BUTTON}
                            >
                              <Copy className="h-4 w-4" aria-hidden />
                            </button>
                          )}
                          {canEdit && board.system_key === null && (
                            <button
                              type="button"
                              aria-label={`${board.name} 휴지통으로`}
                              title="휴지통 이동"
                              disabled={actionPending}
                              aria-busy={
                                deleteBoard.isPending && deleteBoard.variables === board.id
                              }
                              onClick={() => void remove(board)}
                              className={`${ICON_BUTTON} hover:bg-red-50 hover:text-red-600`}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {boards && !boardsQuery.isError && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-4 text-xs text-slate-500">
            <p role="status">
              전체 {boards.length}개 중 {filteredBoards?.length ?? 0}개
            </p>
            {lastPage > 1 && (
              <nav aria-label="페이지 이동" className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="이전 페이지"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                  className="h-8 min-w-8 rounded-md px-2 hover:bg-slate-100 disabled:opacity-40"
                >
                  ‹
                </button>
                {Array.from({ length: lastPage }, (_, index) => index + 1).map((number) => (
                  <button
                    key={number}
                    type="button"
                    aria-current={number === currentPage ? 'page' : undefined}
                    onClick={() => setPage(number)}
                    className={`h-8 min-w-8 rounded-md px-2 ${number === currentPage ? 'bg-blue-50 font-semibold text-blue-700' : 'hover:bg-slate-100'}`}
                  >
                    {number}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="다음 페이지"
                  disabled={currentPage >= lastPage}
                  onClick={() => setPage(currentPage + 1)}
                  className="h-8 min-w-8 rounded-md px-2 hover:bg-slate-100 disabled:opacity-40"
                >
                  ›
                </button>
              </nav>
            )}
          </div>
        )}
      </section>

      <div className={HELP_STRIP}>
        <CircleHelp className="h-4 w-4 shrink-0" aria-hidden />
        <span>
          <strong className="font-medium text-slate-600">게시판과 게시글은 따로 관리해요.</strong>{' '}
          게시판 설정은 설정 버튼에서, 글 쓰기와 고치기는 게시판 이름이나 게시글 관리에서 하세요.
        </span>
      </div>
      <div className={HELP_STRIP}>
        <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
        <span>지운 게시판은 휴지통에 보관되고, 복원할 수 있어요.</span>
        <Link
          to="/admin/boards/trash"
          className="ml-auto whitespace-nowrap font-medium text-blue-600 hover:underline"
        >
          휴지통 보기 →
        </Link>
      </div>
    </div>
  )
}
