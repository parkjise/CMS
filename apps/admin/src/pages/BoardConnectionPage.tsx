import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { useParams } from 'react-router'
import type { Board } from '@cms/types'
import { Button, Input, Toggle, toast } from '@cms/ui'
import { BoardDetailHeader } from '@/components/boards/BoardDetailHeader'
import { PAGE } from '@/components/boards/boardStyles'
import { ReadOnlyFieldset } from '@/components/layout/ReadOnlyFieldset'
import { useBoards, useMenuParents, useUpdateBoard } from '@/hooks/useBoards'
import { useCanEdit } from '@/hooks/useCanEdit'
import { useSiteMenu, useUpdateSiteMenu } from '@/hooks/useSiteSettings'
import { setVisibleByKey } from '@/lib/menuTree'
import { boardSlugError } from '@/lib/boardLabels'
import { pickErrorMessage } from '@/lib/errorMessages'
import { useAuthStore } from '@/stores/authStore'

const CLIENT_BASE_URL = import.meta.env.VITE_CLIENT_BASE_URL ?? 'http://localhost:3000'

/** 메뉴 위치 (T-216, 1113 #3) — 상단 메뉴 또는 페이지 묶음 아래(하위 탭). 고르면 바로 저장 */
function MenuParentChoice({ board }: { board: Board }) {
  const options = useMenuParents()
  const updateBoard = useUpdateBoard()
  const queryClient = useQueryClient()
  const current = board.menu_parent ?? ''
  if (!options.isSuccess) return null
  if (options.data.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        지금 템플릿은 상단 메뉴만 있어요. 게시판은 상단 메뉴에 나옵니다.
      </p>
    )
  }
  // 템플릿을 바꿔 묶음이 없어졌으면 홈페이지는 상단 메뉴로 보인다
  const missing = current !== '' && !options.data.some((o) => o.key === current)

  const change = async (menu_parent: string) => {
    try {
      await updateBoard.mutateAsync({ id: board.id, payload: { menu_parent } })
      // 상단 메뉴 후보가 바뀐다
      await queryClient.invalidateQueries({ queryKey: ['site-settings'] })
      const title = options.data.find((o) => o.key === menu_parent)?.title
      toast.success(title ? `${title} 아래 하위 탭에 넣었습니다.` : '상단 메뉴에 넣었습니다.')
    } catch (err) {
      toast.error(pickErrorMessage(err, '메뉴 위치를 저장하지 못했습니다.'))
    }
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={`menu-parent-${board.id}`} className="block text-sm font-medium text-slate-700">
        메뉴 위치
      </label>
      <select
        id={`menu-parent-${board.id}`}
        className="h-10 w-full max-w-sm rounded-md border border-slate-300 bg-white px-3 text-sm"
        value={missing ? '' : current}
        disabled={updateBoard.isPending}
        onChange={(e) => void change(e.target.value)}
      >
        <option value="">상단 메뉴</option>
        {options.data.map((o) => (
          <option key={o.key} value={o.key}>
            {o.title} 아래 (하위 탭)
          </option>
        ))}
      </select>
      <p className="text-xs text-slate-500">
        {missing
          ? '고른 메뉴가 지금 템플릿에 없어 상단 메뉴에 보입니다.'
          : current
            ? '홈페이지에서 그 메뉴의 하위 탭으로 나오고, 상단 메뉴에서는 빠집니다.'
            : '페이지 아래에 넣으면 그 메뉴의 하위 탭으로 나옵니다.'}
      </p>
    </div>
  )
}

function MenuToggle({ board }: { board: Board }) {
  const menuQuery = useSiteMenu()
  const updateMenu = useUpdateSiteMenu()
  // 공지는 코드형에선 템플릿 페이지, 테마형에선 게시판으로 메뉴에 있다 (T-176)
  const key =
    board.system_key && menuQuery.data?.mode === 'code' ? board.system_key : `board:${board.id}`
  const items = menuQuery.data?.items ?? []
  const item = items.find((i) => i.key === key)
  if (!item) {
    return board.status === 'ACTIVE' ? null : (
      <p className="text-sm text-slate-500">사용으로 바꾸면 상단 메뉴 표시를 고를 수 있습니다.</p>
    )
  }

  const change = (visible: boolean) =>
    updateMenu.mutate(setVisibleByKey(menuQuery.data?.nodes ?? [], key, visible, item.label ?? item.default_label), {
      onSuccess: () => toast.success(visible ? '상단 메뉴에 표시합니다.' : '상단 메뉴에서 숨겼습니다.'),
      onError: (error) => toast.error(pickErrorMessage(error, '메뉴를 저장하지 못했습니다.')),
    })

  return (
    <Toggle
      label="상단 메뉴에 표시"
      description="메뉴 이름 · 순서 · 하위 메뉴는 사이트 관리 → 메뉴 관리에서 바꿉니다. 끄더라도 주소로는 열립니다."
      checked={item.visible}
      disabled={updateMenu.isPending}
      onChange={(e) => change(e.target.checked)}
    />
  )
}

function ConnectionForm({ board }: { board: Board }) {
  const canEdit = useCanEdit()
  const updateBoard = useUpdateBoard()
  const tenantSlug = useAuthStore((s) => s.tenantSlug)
  const [slug, setSlug] = useState(board.slug)
  const [active, setActive] = useState(board.status === 'ACTIVE')
  const [slugError, setSlugError] = useState<string>()

  const isSystem = board.system_key !== null
  const publicUrl =
    tenantSlug && !isSystem && board.status === 'ACTIVE'
      ? `${CLIENT_BASE_URL}/${tenantSlug}/b/${board.slug}`
      : null

  const save = async () => {
    const error = boardSlugError(slug)
    setSlugError(error)
    if (error) return
    try {
      await updateBoard.mutateAsync({
        id: board.id,
        payload: { slug, status: active ? 'ACTIVE' : 'INACTIVE' },
      })
      toast.success('저장했습니다.')
    } catch (err) {
      toast.error(pickErrorMessage(err, '저장하지 못했습니다.'))
    }
  }

  return (
    <div className="space-y-5">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <ReadOnlyFieldset>
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <Input
              label="주소 이름"
              maxLength={60}
              value={slug}
              error={slugError}
              disabled={isSystem}
              helperText={
                isSystem
                  ? '기본 게시판의 주소는 바꿀 수 없습니다.'
                  : slug !== board.slug
                    ? '주소를 바꾸면 이전 주소는 더 이상 열리지 않습니다.'
                    : undefined
              }
              onChange={(e) => setSlug(e.target.value)}
            />
            <Toggle
              label="게시판 사용"
              description="끄면 홈페이지 메뉴에서 빠지고 글이 보이지 않습니다."
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
          </div>
        </ReadOnlyFieldset>
        {canEdit && (
          <div className="flex justify-end">
            <Button type="submit" loading={updateBoard.isPending}>
              저장
            </Button>
          </div>
        )}
      </form>

      <ReadOnlyFieldset>
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {!isSystem && <MenuParentChoice board={board} />}
          <MenuToggle board={board} />
          {publicUrl && (
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              홈페이지에서 보기
            </a>
          )}
        </div>
      </ReadOnlyFieldset>
    </div>
  )
}

/** 홈페이지 연결 — 주소 · 사용 여부 · 메뉴 표시 (게시판 모듈 기획서 4장). 유형은 게시판 디자인 탭 (T-148) */
export function BoardConnectionSection({ boardId }: { boardId: string }) {
  const boardsQuery = useBoards()
  const board = boardsQuery.data?.find((b) => b.id === boardId)

  return (
    <>
      {boardsQuery.isLoading && (
        <div className="h-40 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
      )}
      {boardsQuery.isError && <p className="text-sm text-red-600">게시판을 불러오지 못했습니다.</p>}
      {boardsQuery.isSuccess && !board && <p className="text-sm text-slate-500">게시판을 찾을 수 없습니다.</p>}
      {board && <ConnectionForm key={board.id} board={board} />}
    </>
  )
}

/** 한 구역만 보는 화면 — 앱은 합친 화면(설정 · 필드 · 카테고리)을 쓴다 (T-212) */
export function BoardConnectionPage() {
  const { boardId = '' } = useParams()
  return (
    <div className={PAGE}>
      <BoardDetailHeader boardId={boardId} />
      <BoardConnectionSection boardId={boardId} />
    </div>
  )
}
