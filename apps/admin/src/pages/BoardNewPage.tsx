import { useEffect, useRef, useState } from 'react'
import { Link, useBlocker, useNavigate, useSearchParams } from 'react-router'
import type { Board, BoardOperation, BoardPermissions, BoardType } from '@cms/types'
import { Button, Input, Textarea, toast } from '@cms/ui'
import {
  useBoardLimits,
  useBoardPresets,
  useBoardTypeOptions,
  useCreateBoard,
  useNewBoardPermissionOptions,
  useSlugCheck,
} from '@/hooks/useBoards'
import { BoardPageTitle } from '@/components/boards/BoardPageTitle'
import {
  CARD,
  LINK_PRIMARY,
  LINK_SECONDARY,
  PAGE,
  TAG_DEFAULT,
} from '@/components/boards/boardStyles'
import { useCanEdit } from '@/hooks/useCanEdit'
import { BOARD_EXAMPLES } from '@/lib/boardExamples'
import { READ_OPTIONS, WRITE_OPTIONS } from '@/lib/boardPermissions'
import { BASE_FIELDS, BOARD_TYPES, boardSlugError, boardTypeLabel } from '@/lib/boardLabels'
import { fieldTypeLabel } from '@/lib/customFields'
import { pickErrorMessage } from '@/lib/errorMessages'

/** 서버 오류의 칸 — 주소 이름 · 이름이면 1단계로 돌아가 칸 아래에 보인다 (T-210) */
const errorField = (error: unknown): string | undefined =>
  (error as { response?: { data?: { error?: { field?: string | null } } } })?.response?.data?.error
    ?.field ?? undefined

const STEPS = ['기본 정보', '유형 · 디자인', '필드 구성', '권한 · 운영', '검토'] as const
const STEP_TITLES = [
  '기본 정보를 입력해 주세요',
  '게시판의 유형을 선택하세요',
  '글에 담을 정보를 확인하세요',
  '누가 읽고 쓸지 고르세요',
  '마지막으로 설정을 확인하세요',
]
/** 새 게시판의 처음 권한 · 운영 — 서버 기본값과 같다 (schemas/board.py) */
const DEFAULT_PERMISSIONS: BoardPermissions = { read: 'PUBLIC', write: 'ADMIN' }
const DEFAULT_OPERATION: BoardOperation = {
  allow_secret: false,
  notify_new_post: false,
  allow_guest: false,
}
const label = <T extends string>(options: { value: T; label: string }[], value: T) =>
  options.find((o) => o.value === value)?.label ?? value
const HINT =
  'rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3 text-xs leading-relaxed text-slate-600'

/** 유형 카드의 작은 모양 — 목록은 줄, 사진 유형은 칸, 웹진은 왼쪽 사진 + 줄 */
function TypeSketch({ type }: { type: BoardType }) {
  const tiles = type === 'GALLERY' || type === 'CARD'
  if (type === 'REVIEW') {
    return (
      <span aria-hidden className="mb-3 flex h-16 flex-col gap-1.5 rounded-md bg-slate-100 p-3">
        <i className="text-xs not-italic leading-none tracking-widest text-amber-400">★★★★★</i>
        <i className="h-1.5 w-full rounded-sm bg-slate-300" />
        <i className="h-1.5 w-2/3 rounded-sm bg-slate-300" />
      </span>
    )
  }
  if (type === 'WEBZINE') {
    return (
      <span aria-hidden className="mb-3 flex h-16 gap-2 rounded-md bg-slate-100 p-3">
        <i className="h-full w-14 rounded-sm bg-slate-300" />
        <span className="flex flex-1 flex-col gap-1.5">
          <i className="h-1.5 w-full rounded-sm bg-slate-300" />
          <i className="h-1.5 w-2/3 rounded-sm bg-slate-300" />
        </span>
      </span>
    )
  }
  return (
    <span
      aria-hidden
      className={`mb-3 flex h-16 gap-1.5 rounded-md bg-slate-100 p-3 ${tiles ? 'flex-row' : 'flex-col'}`}
    >
      {[0, 1, 2].map((bar) => (
        <i
          key={bar}
          className={`rounded-sm bg-slate-300 ${tiles ? 'h-full flex-1' : `h-1.5 ${bar === 1 ? 'w-2/3' : bar === 2 ? 'w-5/6' : 'w-full'}`}`}
        />
      ))}
    </span>
  )
}

interface SummaryRowProps {
  label: string
  value: string
  /** 검토 단계 — 그 값을 고치는 단계로 바로 간다 (T-210) */
  onEdit?: () => void
}

const SummaryRow = ({ label, value, onEdit }: SummaryRowProps) => (
  <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-3.5 text-sm last:border-0">
    <span className="text-slate-500">{label}</span>
    <span className="flex items-center gap-3">
      <strong className="text-right font-medium text-slate-800">{value}</strong>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="text-xs font-medium text-blue-600 hover:underline"
          aria-label={`${label} 수정`}
        >
          수정
        </button>
      )}
    </span>
  </div>
)

interface AccessChoiceProps<T extends string> {
  legend: string
  name: string
  options: { value: T; label: string; hint: string }[]
  value: T
  /** 회원 값을 고를 수 없는 이유 (회원 기능 꺼짐 · 병원 업종) */
  blocked: string | null
  onChange: (value: T) => void
}

/** 4단계 권한 하나 — 권한 구역과 같은 선택지 · 막힘 (T-211) */
function AccessChoice<T extends string>({
  legend,
  name,
  options,
  value,
  blocked,
  onChange,
}: AccessChoiceProps<T>) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-slate-700">{legend}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => {
          const disabled = option.value === 'MEMBER' && Boolean(blocked)
          return (
            <label
              key={option.value}
              className={`flex gap-3 rounded-lg border p-3 text-sm ${
                value === option.value ? 'border-blue-600 bg-blue-50' : 'border-slate-200'
              } ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
            >
              <input
                type="radio"
                name={name}
                className="mt-0.5 accent-blue-600"
                checked={value === option.value}
                disabled={disabled}
                onChange={() => onChange(option.value)}
              />
              <span>
                <span className="block font-medium text-slate-900">{option.label}</span>
                <span className="text-xs text-slate-500">
                  {disabled ? blocked : option.hint}
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/** 게시판 만들기 마법사 (BM-02 · UI/UX 시안 v3, T-188) — 다섯 단계, 권한 · 운영은 만든 뒤 바꾼다 */
export function BoardNewPage() {
  const canEdit = useCanEdit()
  const limitsQuery = useBoardLimits()
  const createBoard = useCreateBoard()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const example = BOARD_EXAMPLES.find((item) => item.id === searchParams.get('example'))
  const [step, setStep] = useState(0)
  // 가 본 단계까지는 위 단계 표시에서 바로 이동 (T-210)
  const [reached, setReached] = useState(0)
  const [name, setName] = useState(example?.name ?? '')
  const [description, setDescription] = useState(example?.description ?? '')
  const [slug, setSlug] = useState('')
  const [boardType, setBoardType] = useState<BoardType>(example?.board_type ?? 'LIST')
  const [active, setActive] = useState(true)
  const [inMenu, setInMenu] = useState(true)
  // 4단계 권한 · 운영 (T-211) — 권한 구역과 같은 막힘 조건
  const [permissions, setPermissions] = useState<BoardPermissions>(DEFAULT_PERMISSIONS)
  const [operation, setOperation] = useState<BoardOperation>(DEFAULT_OPERATION)
  const optionsQuery = useNewBoardPermissionOptions()
  const readBlocked = optionsQuery.data?.member_read_blocked ?? null
  const writeBlocked = optionsQuery.data?.member_write_blocked ?? null
  const accessSummary = [
    `${label(READ_OPTIONS, permissions.read)} 읽기`,
    `${label(WRITE_OPTIONS, permissions.write)} 글쓰기`,
    ...(operation.allow_guest ? ['비회원 글쓰기'] : []),
    ...(operation.allow_secret ? ['비밀글'] : []),
  ].join(' / ')
  const [errors, setErrors] = useState<{ name?: string; slug?: string }>({})
  const [created, setCreated] = useState<Board | null>(null)
  const slugInput = useRef<HTMLInputElement>(null)
  // 주소 이름 — 입력을 멈추면 서버에 미리 확인 (T-210)
  const [checkedSlug, setCheckedSlug] = useState('')
  useEffect(() => {
    const timer = window.setTimeout(() => setCheckedSlug(slug), 400)
    return () => window.clearTimeout(timer)
  }, [slug])
  const formatError = slug ? boardSlugError(slug) : undefined
  const slugCheck = useSlugCheck(!formatError && checkedSlug === slug ? slug : '')
  const slugReason =
    errors.slug ??
    formatError ??
    (slugCheck.data?.available === false ? slugCheck.data.reason : null)
  // 유형별 추천 칸 (T-183) — 고르지 않은 유형은 전부 체크한 상태로 시작
  const presetsQuery = useBoardPresets()
  const [presetPicks, setPresetPicks] = useState<Partial<Record<BoardType, string[]>>>({})
  const [createdPresets, setCreatedPresets] = useState(0)
  const presets = presetsQuery.data?.[boardType] ?? []
  const blockedTypes = useBoardTypeOptions().data?.blocked ?? {}
  const pickedPresets = presetPicks[boardType] ?? presets.map((p) => p.key)
  // 추천 칸을 못 불러왔으면 보내지 않는다 — 칸은 만든 뒤 필드 관리에서
  // 늘 만드는 칸(리뷰형 별점)은 체크와 상관없이 보낸다 — 서버도 넣는다
  const sendPresets = presetsQuery.isSuccess
    ? presets.filter((p) => p.always || pickedPresets.includes(p.key)).map((p) => p.key)
    : []
  const togglePreset = (key: string, checked: boolean) =>
    setPresetPicks((picks) => ({
      ...picks,
      [boardType]: checked
        ? [...pickedPresets, key]
        : pickedPresets.filter((picked) => picked !== key),
    }))

  const limits = limitsQuery.data
  const last = STEPS.length - 1

  const goTo = (target: number) => {
    setStep(target)
    setReached((r) => Math.max(r, target))
  }

  const next = () => {
    if (step === 0) {
      const found = {
        name: name.trim() ? undefined : '이름을 입력해주세요.',
        slug: slug
          ? (boardSlugError(slug) ??
            (slugCheck.data?.available === false
              ? (slugCheck.data.reason ?? undefined)
              : undefined))
          : undefined,
      }
      setErrors(found)
      if (found.name || found.slug) return
    }
    goTo(step + 1)
  }

  // 입력한 뒤 다른 메뉴로 가면 확인 (T-210) — 만든 뒤 · [취소] 로 나갈 때는 묻지 않는다
  const typed = Boolean(name.trim() || description.trim() || slug)
  const leaving = useRef(false)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      typed && !created && !leaving.current && currentLocation.pathname !== nextLocation.pathname
  )
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm('게시판 만들기를 그만두고 나갈까요? 입력한 내용은 저장되지 않습니다.')) {
      blocker.proceed()
    } else {
      blocker.reset()
    }
  }, [blocker])
  useEffect(() => {
    if (!typed || created) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [typed, created])

  const cancel = () => {
    if (typed && !window.confirm('게시판 만들기를 그만둘까요? 입력한 내용은 저장되지 않습니다.'))
      return
    leaving.current = true
    navigate('/admin/boards')
  }

  const submit = async () => {
    try {
      const board = await createBoard.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        slug: slug || undefined,
        board_type: boardType,
        status: active ? 'ACTIVE' : 'INACTIVE',
        in_menu: inMenu,
        preset_fields: sendPresets,
        permissions,
        operation,
      })
      setCreatedPresets(sendPresets.length)
      setCreated(board)
    } catch (error) {
      const message = pickErrorMessage(error, '게시판을 만들지 못했습니다.')
      const field = errorField(error)
      // 칸 오류면 그 칸이 있는 단계로 돌아가 칸 아래에 보인다 — 토스트만 띄우지 않는다
      if (field === 'slug' || field === 'name') {
        setErrors({ [field]: message })
        setStep(0)
        window.setTimeout(() => slugInput.current?.focus(), 0)
        return
      }
      toast.error(message)
    }
  }

  if (created) {
    return (
      <div className={PAGE}>
        <h1 className="text-2xl font-bold text-slate-900">
          게시판을 만들었습니다
        </h1>
        <section className={`max-w-3xl space-y-4 ${CARD}`}>
          <p className="text-sm text-slate-600">
            <strong className="text-slate-900">{created.name}</strong> 의 주소 이름은{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{created.slug}</code>{' '}
            입니다.
          </p>
          <p className={HINT}>
            {created.status !== 'ACTIVE'
              ? '사용으로 바꾸면 홈페이지 상단 메뉴에 나옵니다.'
              : inMenu
                ? '홈페이지 상단 메뉴에 추가했습니다.'
                : '상단 메뉴에는 넣지 않았습니다.'}{' '}
            메뉴 이름과 보이기는 공통 설정의 상단 메뉴에서 바꿀 수 있습니다.
          </p>
          {createdPresets > 0 && (
            <p className="text-sm text-slate-600">
              추천 칸 {createdPresets}개를 함께 만들었습니다. 이름 · 선택지 · 순서는 칸 설정에서
              바꿀 수 있습니다.
            </p>
          )}
          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
            <Link to={`/admin/boards/${created.id}/posts/new`} className={LINK_PRIMARY}>
              첫 글 쓰기
            </Link>
            <Link to={`/admin/boards/${created.id}/fields`} className={LINK_SECONDARY}>
              칸 설정
            </Link>
            <Link to={`/admin/boards/${created.id}/settings`} className={LINK_SECONDARY}>
              게시판 설정
            </Link>
            <Link
              to="/admin/boards"
              className="inline-flex h-10 items-center rounded-lg px-4 text-sm text-slate-600 hover:bg-slate-100"
            >
              목록으로
            </Link>
          </div>
        </section>
      </div>
    )
  }

  const wizardOpen = canEdit && !(limits && !limits.can_create)

  return (
    <div className={PAGE}>
      <BoardPageTitle
        title="게시판 만들기"
        description="다섯 단계로 사이트에 맞는 게시판을 만드세요. 권한 · 운영 설정은 만든 뒤에도 바꿀 수 있어요."
        actions={
          wizardOpen && (
            <button
              type="button"
              onClick={cancel}
              className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              취소
            </button>
          )
        }
      />

      {!canEdit ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          보기 전용 계정은 게시판을 추가할 수 없습니다.
        </p>
      ) : limits && !limits.can_create ? (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p>{limits.reason}</p>
          <Link to="/admin/billing" className="font-medium underline">
            요금제 보기
          </Link>
        </div>
      ) : (
        <>
          {example && (
            <p className={HINT}>
              ‘{example.name}’ 예시에서 시작합니다. 이름, 설명, 모양을 바꿀 수 있습니다.
            </p>
          )}
          <ol
            className="flex gap-2 rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
            aria-label="게시판 만들기 단계"
          >
            {STEPS.map((label, i) => {
              const canJump = i !== step && i <= reached
              const content = (
                <>
                  <b
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs ${
                      i === step
                        ? 'bg-blue-600 text-white'
                        : i <= reached
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {i !== step && i < reached ? '✓' : i + 1}
                  </b>
                  {label}
                </>
              )
              const look = `flex flex-1 flex-col items-center gap-1.5 text-center text-[10px] sm:flex-row sm:text-left sm:text-xs ${
                i === step
                  ? 'font-semibold text-blue-700'
                  : i <= reached
                    ? 'text-slate-600'
                    : 'text-slate-400'
              }`
              return (
                <li
                  key={label}
                  aria-current={i === step ? 'step' : undefined}
                  className="flex flex-1"
                >
                  {canJump ? (
                    <button
                      type="button"
                      onClick={() => goTo(i)}
                      className={`${look} rounded-md hover:text-blue-700`}
                      aria-label={`${i + 1}단계 ${label}로 이동`}
                    >
                      {content}
                    </button>
                  ) : (
                    <span className={look}>{content}</span>
                  )}
                </li>
              )
            })}
          </ol>

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
            <section className={`space-y-5 ${CARD}`}>
              <h2 className="text-base font-semibold text-slate-800">{STEP_TITLES[step]}</h2>

              {step === 0 && (
                <div className="grid gap-5 md:grid-cols-2">
                  <Input
                    label="게시판 이름"
                    required
                    maxLength={100}
                    value={name}
                    error={errors.name}
                    placeholder="예: 병원 소식"
                    helperText="방문자가 알아보기 쉬운 이름을 입력하세요."
                    onChange={(e) => setName(e.target.value)}
                  />
                  <Input
                    ref={slugInput}
                    label="주소 이름"
                    maxLength={60}
                    value={slug}
                    error={slugReason ?? undefined}
                    placeholder="예: news"
                    helperText="비워 두면 자동으로 만듭니다. 영문 소문자 · 숫자 · 하이픈만 쓸 수 있습니다."
                    onChange={(e) => {
                      setSlug(e.target.value)
                      setErrors((prev) => ({ ...prev, slug: undefined }))
                    }}
                  />
                  <div className="md:col-span-2">
                    <Textarea
                      label="설명 (선택)"
                      rows={2}
                      maxLength={200}
                      value={description}
                      helperText="관리자가 알아보기 위한 설명입니다."
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                  <fieldset className="space-y-2.5 md:col-span-2">
                    <legend className="mb-2 text-sm font-medium text-slate-700">운영 상태</legend>
                    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-blue-600"
                        checked={active}
                        onChange={(e) => setActive(e.target.checked)}
                      />
                      만든 뒤 바로 사용
                    </label>
                    {active ? (
                      <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-800">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-blue-600"
                          checked={inMenu}
                          onChange={(e) => setInMenu(e.target.checked)}
                        />
                        홈페이지 상단 메뉴에 추가
                      </label>
                    ) : (
                      <p className="text-xs text-slate-500">
                        글을 준비한 뒤 게시판 설정에서 켜면 홈페이지에 나옵니다.
                      </p>
                    )}
                  </fieldset>
                </div>
              )}

              {step === 1 && (
                <>
                  <fieldset>
                    <legend className="sr-only">게시판 유형</legend>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {BOARD_TYPES.map((type) => {
                        // 병원 업종은 리뷰형을 고를 수 없다 — 서버도 막는다 (T-218)
                        const blocked = blockedTypes[type.value]
                        return (
                          <label
                            key={type.value}
                            className={`relative rounded-lg border p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 ${
                              blocked
                                ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-70'
                                : boardType === type.value
                                  ? 'cursor-pointer border-blue-600 bg-blue-50/60'
                                  : 'cursor-pointer border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name="board_type"
                              className="sr-only"
                              checked={boardType === type.value}
                              disabled={Boolean(blocked)}
                              aria-describedby={blocked ? `type-blocked-${type.value}` : undefined}
                              onChange={() => setBoardType(type.value)}
                            />
                            <TypeSketch type={type.value} />
                            <span className="block text-sm font-semibold text-slate-800">
                              {type.label}
                            </span>
                            <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                              {type.hint}
                            </span>
                            {blocked && (
                              <span
                                id={`type-blocked-${type.value}`}
                                className="mt-1.5 block text-xs leading-relaxed text-amber-700"
                              >
                                {blocked}
                              </span>
                            )}
                            {boardType === type.value && (
                              <span
                                aria-hidden
                                className="absolute right-2.5 top-2 text-sm text-blue-600"
                              >
                                ✓
                              </span>
                            )}
                          </label>
                        )
                      })}
                    </div>
                  </fieldset>
                  <p className={HINT}>
                    디자인을 바꿔도 글은 그대로 남습니다. 만든 뒤 게시판 디자인에서 바꿀 수 있어요.
                  </p>
                </>
              )}

              {step === 2 && (
                <>
                  <p className={HINT}>
                    {boardTypeLabel(boardType)}에 필요한 기본 필드가 함께 만들어집니다. 다른 칸은
                    만든 뒤 필드 관리에서 추가할 수 있어요.
                  </p>
                  <ul className="divide-y divide-slate-100">
                    {BASE_FIELDS.map((field) => (
                      <li key={field.key} className="flex items-center gap-3 py-3 text-sm">
                        <span className="min-w-0 flex-1 font-medium text-slate-800">
                          {field.label}
                          <span className="ml-2.5 font-mono text-[11px] font-normal text-slate-400">
                            {field.key}
                          </span>
                        </span>
                        <span className="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-400">
                          기본 제공
                        </span>
                      </li>
                    ))}
                  </ul>
                  {presets.length > 0 && (
                    <fieldset className="space-y-2.5 rounded-lg bg-slate-50 p-4">
                      {/* 회색 상자 안에서 제목이 테두리에 걸리지 않게 띄워 둔다 */}
                      <legend className="float-left mb-1 w-full text-sm font-medium text-slate-700">
                        함께 만들 추천 칸
                      </legend>
                      <p className="clear-both text-xs text-slate-500">
                        필요 없는 칸은 체크를 풀어 주세요. 만든 뒤에도 칸 설정에서 고칠 수 있습니다.
                      </p>
                      {presets.map((preset) => (
                        <label key={preset.key} className="flex items-start gap-2.5 text-sm">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 accent-blue-600"
                            checked={preset.always || pickedPresets.includes(preset.key)}
                            disabled={preset.always}
                            onChange={(e) => togglePreset(preset.key, e.target.checked)}
                          />
                          <span>
                            <span className="text-slate-900">{preset.label}</span>{' '}
                            <span className="text-xs text-slate-500">
                              ({fieldTypeLabel(preset.field_type)}
                              {preset.choices.length > 0 && `: ${preset.choices.join(' · ')}`})
                            </span>
                            {preset.always && (
                              <span className="block text-xs text-slate-500">
                                {boardTypeLabel(boardType)}에는 늘 들어갑니다.
                              </span>
                            )}
                          </span>
                        </label>
                      ))}
                    </fieldset>
                  )}
                  {presetsQuery.isError && (
                    <p className="text-xs text-slate-500">
                      추천 칸을 불러오지 못했습니다. 칸은 만든 뒤 칸 설정에서 추가할 수 있습니다.
                    </p>
                  )}
                  <p className="text-xs text-slate-500">
                    사용자 정의 필드 {sendPresets.length}개 ·{' '}
                    {sendPresets.length
                      ? '추천 칸과 함께 시작합니다.'
                      : '기본 필드만으로 시작합니다.'}
                  </p>
                </>
              )}

              {step === 3 && (
                <>
                  <p className={HINT}>
                    누가 글을 읽고 쓸지 고르세요. 처음 값은 누구나 읽기 · 관리자 글쓰기이고, 만든 뒤
                    설정 › 권한 · 운영 설정에서 바꿀 수 있어요.
                  </p>
                  <AccessChoice
                    legend="글 읽기"
                    name="new-board-read"
                    options={READ_OPTIONS}
                    value={permissions.read}
                    blocked={readBlocked}
                    onChange={(read) => setPermissions((p) => ({ ...p, read }))}
                  />
                  <AccessChoice
                    legend="글쓰기"
                    name="new-board-write"
                    options={WRITE_OPTIONS}
                    value={permissions.write}
                    blocked={writeBlocked}
                    onChange={(write) => {
                      setPermissions((p) => ({ ...p, write }))
                      // 비밀글은 회원 글에 쓰인다 — 관리자만이면 끈다
                      if (write === 'ADMIN') setOperation((o) => ({ ...o, allow_secret: false }))
                    }}
                  />
                  <fieldset className="space-y-2.5">
                    <legend className="mb-2 text-sm font-medium text-slate-700">운영</legend>
                    <label className="flex items-start gap-2.5 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 accent-blue-600"
                        checked={operation.allow_guest}
                        disabled={Boolean(writeBlocked)}
                        onChange={(e) =>
                          setOperation((o) => ({ ...o, allow_guest: e.target.checked }))
                        }
                      />
                      <span>
                        비회원 글쓰기
                        <span className="block text-xs text-slate-500">
                          {writeBlocked ?? '로그인하지 않은 방문자도 이름 · 글 비밀번호로 씁니다.'}
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 accent-blue-600"
                        checked={operation.allow_secret}
                        disabled={permissions.write !== 'MEMBER'}
                        onChange={(e) =>
                          setOperation((o) => ({ ...o, allow_secret: e.target.checked }))
                        }
                      />
                      <span>
                        비밀글
                        <span className="block text-xs text-slate-500">
                          {permissions.write === 'MEMBER'
                            ? '회원이 비밀글을 고를 수 있습니다. 내용은 쓴 회원과 관리자만 봅니다.'
                            : '글쓰기를 회원도로 고르면 쓸 수 있어요.'}
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 accent-blue-600"
                        checked={operation.notify_new_post}
                        onChange={(e) =>
                          setOperation((o) => ({ ...o, notify_new_post: e.target.checked }))
                        }
                      />
                      <span>
                        새 글 알림
                        <span className="block text-xs text-slate-500">
                          회원 · 비회원이 새 글을 쓰면 관리자 화면에 알림이 뜹니다.
                        </span>
                      </span>
                    </label>
                  </fieldset>
                </>
              )}

              {step === 4 && (
                <>
                  <p className={HINT}>
                    입력한 내용을 확인해 주세요. 아래 버튼을 누르면 게시판이 만들어집니다.
                  </p>
                  <div>
                    <SummaryRow label="게시판 이름" value={name.trim()} onEdit={() => goTo(0)} />
                    <SummaryRow
                      label="주소 이름"
                      value={slug || '자동으로 만듦'}
                      onEdit={() => goTo(0)}
                    />
                    {description.trim() && (
                      <SummaryRow label="설명" value={description.trim()} onEdit={() => goTo(0)} />
                    )}
                    <SummaryRow
                      label="유형"
                      value={boardTypeLabel(boardType)}
                      onEdit={() => goTo(1)}
                    />
                    <SummaryRow
                      onEdit={() => goTo(0)}
                      label="운영 상태"
                      value={
                        active
                          ? inMenu
                            ? '사용 · 상단 메뉴에 추가'
                            : '사용 · 메뉴에 넣지 않음'
                          : '사용 안 함'
                      }
                    />
                    <SummaryRow
                      label="필드 구성"
                      value={`기본 필드 ${BASE_FIELDS.length}개 / 추천 칸 ${sendPresets.length}개`}
                      onEdit={() => goTo(2)}
                    />
                    <SummaryRow label="권한" value={accessSummary} onEdit={() => goTo(3)} />
                  </div>
                </>
              )}

              <div className="flex items-center gap-2 border-t border-slate-200 pt-5">
                {step > 0 && (
                  <Button type="button" variant="secondary" onClick={() => goTo(step - 1)}>
                    ← 이전
                  </Button>
                )}
                <span className="flex-1" />
                <span className="text-xs text-slate-400">
                  {step + 1} / {STEPS.length}
                </span>
                {step < last ? (
                  <Button type="button" onClick={next}>
                    다음 단계 →
                  </Button>
                ) : (
                  <Button type="button" loading={createBoard.isPending} onClick={submit}>
                    게시판 만들기
                  </Button>
                )}
              </div>
            </section>

            <aside className={`hidden text-xs leading-relaxed text-slate-500 xl:block ${CARD}`}>
              <h2 className="mb-3 text-sm font-semibold text-slate-800">게시판 구성 안내</h2>
              <p>
                게시판은 글을 담는 공간이에요. 먼저 유형과 권한을 정하고, 글은 만든 뒤에 쓰면 돼요.
              </p>
              <hr className="my-4 border-slate-200" />
              <p>목록형 공지 · 소식 게시판은 추가 필드 없이 바로 시작할 수 있어요.</p>
              {step > 0 && (
                <>
                  <hr className="my-4 border-slate-200" />
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-slate-700">{name.trim()}</span>
                    <span className={TAG_DEFAULT}>{boardTypeLabel(boardType)}</span>
                  </p>
                </>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
