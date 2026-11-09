import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { useParams } from 'react-router'
import type { Board } from '@cms/types'
import { Button, Input, Toggle, toast } from '@cms/ui'
import { BoardDetailHeader } from '@/components/boards/BoardDetailHeader'
import { ReadOnlyFieldset } from '@/components/layout/ReadOnlyFieldset'
import { useBoards, useUpdateBoard } from '@/hooks/useBoards'
import { useCanEdit } from '@/hooks/useCanEdit'
import { useSiteMenu, useUpdateSiteMenu } from '@/hooks/useSiteSettings'
import { boardSlugError } from '@/lib/boardLabels'
import { pickErrorMessage } from '@/lib/errorMessages'
import { useAuthStore } from '@/stores/authStore'

const CLIENT_BASE_URL = import.meta.env.VITE_CLIENT_BASE_URL ?? 'http://localhost:3000'

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
    updateMenu.mutate(
      items.map((i) => ({ key: i.key, label: i.label, visible: i.key === key ? visible : i.visible })),
      {
        onSuccess: () => toast.success(visible ? '상단 메뉴에 표시합니다.' : '상단 메뉴에서 숨겼습니다.'),
        onError: (error) => toast.error(pickErrorMessage(error, '메뉴를 저장하지 못했습니다.')),
      },
    )

  return (
    <Toggle
      label="상단 메뉴에 표시"
      description="메뉴 이름과 순서는 공통 설정의 상단 메뉴에서 바꿉니다. 끄더라도 주소로는 열립니다."
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
    <div className="mx-auto max-w-2xl space-y-5">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <ReadOnlyFieldset>
          <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
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
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
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
export function BoardConnectionPage() {
  const { boardId = '' } = useParams()
  const boardsQuery = useBoards()
  const board = boardsQuery.data?.find((b) => b.id === boardId)

  return (
    <div className="space-y-5 p-6 md:p-8">
      <BoardDetailHeader boardId={boardId} />
      {boardsQuery.isLoading && (
        <div className="h-40 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
      )}
      {boardsQuery.isError && <p className="text-sm text-red-600">게시판을 불러오지 못했습니다.</p>}
      {boardsQuery.isSuccess && !board && <p className="text-sm text-slate-500">게시판을 찾을 수 없습니다.</p>}
      {board && <ConnectionForm key={board.id} board={board} />}
    </div>
  )
}
