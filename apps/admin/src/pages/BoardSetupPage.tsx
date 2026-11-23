import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import type { Board } from '@cms/types'
import { toast } from '@cms/ui'
import { BoardDetailHeader } from '@/components/boards/BoardDetailHeader'
import {
  BoardSectionBlock,
  type BoardSectionLink,
  BoardSectionNav,
} from '@/components/boards/BoardSectionNav'
import { PAGE } from '@/components/boards/boardStyles'
import { LeaveGuard } from '@/components/site/LeaveGuard'
import { SaveBar } from '@/components/site/SaveBar'
import { useBoards, useUpdateBoard } from '@/hooks/useBoards'
import { useAeo } from '@/hooks/useSearchSettings'
import { boardSlugError } from '@/lib/boardLabels'
import {
  type SetupDraft,
  type SetupSection,
  changedSections,
  sectionOfField,
  setupImpacts,
  setupPayload,
  toSetupDraft,
} from '@/lib/boardSetup'
import { pickErrorMessage } from '@/lib/errorMessages'
import { BoardConnectionFields } from '@/pages/BoardConnectionPage'
import { BoardOperationFields } from '@/pages/BoardOperationPage'
import { BoardPermissionFields } from '@/pages/BoardPermissionsPage'
import { BoardBasicFields } from '@/pages/BoardSettingsPage'

const SECTION_LABELS: Record<SetupSection, string> = {
  basic: '기본 정보',
  permissions: '권한',
  operation: '운영 설정',
  connection: '홈페이지 연결',
}

/** 400 응답의 칸 이름 · 메시지 */
const fieldError = (error: unknown): { field?: string; message?: string } =>
  (error as { response?: { data?: { error?: { field?: string; message?: string } } } })?.response
    ?.data?.error ?? {}

type Errors = Partial<Record<'name' | 'slug', string>>

function BoardSetupForm({ board }: { board: Board }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const updateBoard = useUpdateBoard()
  const isSystem = board.system_key !== null
  const [saved, setSaved] = useState(() => toSetupDraft(board))
  const [draft, setDraft] = useState(saved)
  const [errors, setErrors] = useState<Errors>({})
  const [removed, setRemoved] = useState(false)
  const changed = changedSections(draft, saved)
  const dirty = changed.length > 0 && !removed
  // FAQ 게시판이면 AEO 구조화 데이터에 연결됐는지 — 끄면 거기서도 빠진다고 알린다
  const aeo = useAeo(board.board_type === 'FAQ')
  const impacts = useMemo(
    () =>
      setupImpacts(draft, saved, {
        faqStructured: Boolean(aeo.data?.faq_board_ids.includes(board.id)),
      }),
    [draft, saved, aeo.data, board.id]
  )

  // 휴지통으로 옮긴 뒤 목록으로 — 저장할 것이 없어 나가기 확인을 건너뛴다
  useEffect(() => {
    if (removed) navigate('/admin/boards')
  }, [removed, navigate])

  const change = <S extends SetupSection>(section: S, value: Partial<SetupDraft[S]>) => {
    setDraft((current) => ({ ...current, [section]: { ...current[section], ...value } }))
    if (section === 'basic' && 'name' in value) setErrors((e) => ({ ...e, name: undefined }))
    if (section === 'connection' && 'slug' in value) setErrors((e) => ({ ...e, slug: undefined }))
  }

  const reveal = (section: SetupSection, inputId?: string) =>
    window.setTimeout(() => {
      document.getElementById(section)?.scrollIntoView?.({ block: 'start' })
      if (inputId) document.getElementById(inputId)?.focus()
    }, 0)

  // 성공 여부를 돌려준다 — 나가기 확인의 [저장하고 이동] (T-227)
  const save = async () => {
    const next: Errors = {
      name: draft.basic.name.trim() ? undefined : '이름을 입력해주세요.',
      slug: changed.includes('connection') ? boardSlugError(draft.connection.slug) : undefined,
    }
    setErrors(next)
    if (next.name || next.slug) {
      if (next.name) reveal('basic', 'board-setup-name')
      else reveal('connection', 'board-setup-slug')
      return false
    }
    try {
      const updated = await updateBoard.mutateAsync({
        id: board.id,
        payload: setupPayload(draft, saved, isSystem),
      })
      // 메뉴 위치를 바꾸면 상단 메뉴 후보가 바뀐다
      if (draft.connection.menu_parent !== saved.connection.menu_parent) {
        await queryClient.invalidateQueries({ queryKey: ['site-settings'] })
      }
      const fresh = toSetupDraft(updated)
      setSaved(fresh)
      setDraft(fresh)
      toast.success('게시판 설정을 저장했습니다. 홈페이지에 바로 반영돼요.')
      return true
    } catch (error) {
      const { field, message } = fieldError(error)
      const section = sectionOfField(field)
      if (field === 'name' || field === 'slug') setErrors({ [field]: message })
      if (section) reveal(section, field === 'slug' ? 'board-setup-slug' : undefined)
      toast.error(pickErrorMessage(error, '저장하지 못했습니다.'))
      return false
    }
  }

  // 기본 게시판(공지)에는 권한 · 운영 설정이 없다
  const sections = (
    isSystem
      ? (['basic', 'connection'] as const)
      : (['basic', 'permissions', 'operation', 'connection'] as const)
  ).map(
    (id): BoardSectionLink => ({ id, label: SECTION_LABELS[id], modified: changed.includes(id) })
  )

  return (
    <>
      <BoardSectionNav sections={sections} />
      <BoardSectionBlock id="basic" title="기본 정보" modified={changed.includes('basic')}>
        <BoardBasicFields
          board={board}
          value={draft.basic}
          onChange={(value) => change('basic', value)}
          nameError={errors.name}
          onRemoved={() => setRemoved(true)}
        />
      </BoardSectionBlock>
      {!isSystem && (
        <>
          <BoardSectionBlock
            id="permissions"
            title="권한"
            modified={changed.includes('permissions')}
          >
            <BoardPermissionFields
              board={board}
              value={draft.permissions}
              onChange={(value) => change('permissions', value)}
              allowGuest={draft.operation.allow_guest}
            />
          </BoardSectionBlock>
          <BoardSectionBlock
            id="operation"
            title="운영 설정"
            modified={changed.includes('operation')}
          >
            <BoardOperationFields
              board={board}
              value={draft.operation}
              onChange={(value) => change('operation', value)}
              permissions={draft.permissions}
            />
          </BoardSectionBlock>
        </>
      )}
      <BoardSectionBlock
        id="connection"
        title="홈페이지 연결"
        modified={changed.includes('connection')}
      >
        <BoardConnectionFields
          board={board}
          value={draft.connection}
          onChange={(value) => change('connection', value)}
          slugError={errors.slug}
        />
      </BoardSectionBlock>

      {dirty && impacts.length > 0 && (
        <ul
          className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          aria-label="저장하면 달라지는 것"
        >
          {impacts.map((impact) => (
            <li key={impact}>{impact}</li>
          ))}
        </ul>
      )}
      <SaveBar
        dirty={dirty}
        saving={updateBoard.isPending}
        onReset={() => {
          setDraft(saved)
          setErrors({})
        }}
        onSave={() => void save()}
      />
      <LeaveGuard dirty={dirty} onSave={save} />
    </>
  )
}

/**
 * 게시판 설정 (T-212, 1113 #13) — 기본 정보 · 권한 · 운영 설정 · 홈페이지 연결을 한 화면에.
 * 저장은 아래 저장 막대 하나로, 바뀐 구역만 모아 한 번에 (T-228). 예전 주소는 #구역 으로 들어온다.
 */
export function BoardSetupPage() {
  const { boardId = '' } = useParams()
  const boardsQuery = useBoards()
  const board = boardsQuery.data?.find((b) => b.id === boardId)

  return (
    <div className={PAGE}>
      <BoardDetailHeader boardId={boardId} />
      {boardsQuery.isLoading && (
        <div className="h-40 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
      )}
      {boardsQuery.isError && <p className="text-sm text-red-600">게시판을 불러오지 못했습니다.</p>}
      {boardsQuery.isSuccess && !board && (
        <p className="text-sm text-slate-500">게시판을 찾을 수 없습니다.</p>
      )}
      {board && <BoardSetupForm key={board.id} board={board} />}
    </div>
  )
}
