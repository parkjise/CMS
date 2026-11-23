import { ExternalLink } from 'lucide-react'
import type { Board } from '@cms/types'
import { Input, Toggle, toast } from '@cms/ui'
import { ReadOnlyFieldset } from '@/components/layout/ReadOnlyFieldset'
import { useMenuParents } from '@/hooks/useBoards'
import { useSiteMenu, useUpdateSiteMenu } from '@/hooks/useSiteSettings'
import { setVisibleByKey } from '@/lib/menuTree'
import type { SetupDraft } from '@/lib/boardSetup'
import { pickErrorMessage } from '@/lib/errorMessages'
import { useAuthStore } from '@/stores/authStore'

const CLIENT_BASE_URL = import.meta.env.VITE_CLIENT_BASE_URL ?? 'http://localhost:3000'

/** 메뉴 위치 (T-216, 1113 #3) — 상단 메뉴 또는 페이지 묶음 아래(하위 탭). 저장 막대로 저장 (T-228) */
function MenuParentChoice({
  board,
  value: current,
  onChange,
}: {
  board: Board
  value: string
  onChange: (menuParent: string) => void
}) {
  const options = useMenuParents()
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

  return (
    <div className="space-y-1.5">
      <label htmlFor={`menu-parent-${board.id}`} className="block text-sm font-medium text-slate-700">
        메뉴 위치
      </label>
      <select
        id={`menu-parent-${board.id}`}
        className="h-10 w-full max-w-sm rounded-md border border-slate-300 bg-white px-3 text-sm"
        value={missing ? '' : current}
        onChange={(e) => onChange(e.target.value)}
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

  // 스위치는 inline-flex — 아래 [홈페이지에서 보기]가 옆에 붙지 않게 한 줄을 차지한다
  return (
    <div>
      <Toggle
        label="상단 메뉴에 표시"
        description="누르면 바로 적용돼요 (사이트 메뉴 설정). 메뉴 이름 · 순서 · 하위 메뉴는 사이트 관리 → 메뉴 관리에서 바꿉니다. 끄더라도 주소로는 열립니다."
        checked={item.visible}
        disabled={updateMenu.isPending}
        onChange={(e) => change(e.target.checked)}
      />
    </div>
  )
}

type Connection = SetupDraft['connection']

interface BoardConnectionFieldsProps {
  board: Board
  value: Connection
  onChange: (change: Partial<Connection>) => void
  slugError?: string
}

/** 홈페이지 연결 구역 — 주소 · 사용 여부 · 메뉴 위치는 저장 막대로, 상단 메뉴 표시는 바로 (T-228) */
export function BoardConnectionFields({ board, value, onChange, slugError }: BoardConnectionFieldsProps) {
  const tenantSlug = useAuthStore((s) => s.tenantSlug)
  const isSystem = board.system_key !== null
  const publicUrl =
    tenantSlug && !isSystem && board.status === 'ACTIVE'
      ? `${CLIENT_BASE_URL}/${tenantSlug}/b/${board.slug}`
      : null

  return (
    <ReadOnlyFieldset>
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <Input
          id="board-setup-slug"
          label="주소 이름"
          maxLength={60}
          value={value.slug}
          error={slugError}
          disabled={isSystem}
          helperText={
            isSystem
              ? '기본 게시판의 주소는 바꿀 수 없습니다.'
              : value.slug !== board.slug
                ? '주소를 바꾸면 이전 주소는 더 이상 열리지 않습니다.'
                : undefined
          }
          onChange={(e) => onChange({ slug: e.target.value })}
        />
        <Toggle
          label="게시판 사용"
          description="끄면 홈페이지 메뉴에서 빠지고 글이 보이지 않습니다."
          checked={value.status === 'ACTIVE'}
          onChange={(e) => onChange({ status: e.target.checked ? 'ACTIVE' : 'INACTIVE' })}
        />
      </div>
      <div className="mt-5 space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {!isSystem && (
          <MenuParentChoice
            board={board}
            value={value.menu_parent}
            onChange={(menu_parent) => onChange({ menu_parent })}
          />
        )}
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
  )
}
