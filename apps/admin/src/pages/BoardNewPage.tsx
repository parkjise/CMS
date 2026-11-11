import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import type { Board, BoardType } from '@cms/types'
import { Button, Input, Textarea, toast } from '@cms/ui'
import { useBoardLimits, useBoardPresets, useCreateBoard } from '@/hooks/useBoards'
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
import { BASE_FIELDS, BOARD_TYPES, boardSlugError, boardTypeLabel } from '@/lib/boardLabels'
import { fieldTypeLabel } from '@/lib/customFields'
import { pickErrorMessage } from '@/lib/errorMessages'

const STEPS = ['기본 정보', '유형 · 디자인', '필드 구성', '권한 · 운영', '검토'] as const
const STEP_TITLES = [
  '기본 정보를 입력해 주세요',
  '게시판의 유형을 선택하세요',
  '글에 담을 정보를 확인하세요',
  '접근 권한을 확인하세요',
  '마지막으로 설정을 확인하세요',
]
/** 새 게시판의 처음 권한 · 운영 값 — 서버 기본값과 같다 (schemas/board.py) */
const DEFAULT_POLICY = [
  ['읽기 권한', '누구나'],
  ['글쓰기', '관리자만'],
  ['비밀글', '사용 안 함'],
  ['새 글 알림', '받지 않음'],
  ['비회원 글쓰기', '사용 안 함'],
] as const
const HINT =
  'rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3 text-xs leading-relaxed text-slate-600'

/** 유형 카드의 작은 모양 — 목록은 줄, 사진 유형은 칸 */
function TypeSketch({ type }: { type: BoardType }) {
  const tiles = type === 'GALLERY' || type === 'CARD'
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

const SummaryRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-4 border-b border-slate-100 py-3.5 text-sm last:border-0">
    <span className="text-slate-500">{label}</span>
    <strong className="text-right font-medium text-slate-800">{value}</strong>
  </div>
)

/** 게시판 만들기 마법사 (BM-02 · UI/UX 시안 v3, T-188) — 다섯 단계, 권한 · 운영은 만든 뒤 바꾼다 */
export function BoardNewPage() {
  const canEdit = useCanEdit()
  const limitsQuery = useBoardLimits()
  const createBoard = useCreateBoard()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const example = BOARD_EXAMPLES.find((item) => item.id === searchParams.get('example'))
  const [step, setStep] = useState(0)
  const [name, setName] = useState(example?.name ?? '')
  const [description, setDescription] = useState(example?.description ?? '')
  const [slug, setSlug] = useState('')
  const [boardType, setBoardType] = useState<BoardType>(example?.board_type ?? 'LIST')
  const [active, setActive] = useState(true)
  const [inMenu, setInMenu] = useState(true)
  const [errors, setErrors] = useState<{ name?: string; slug?: string }>({})
  const [created, setCreated] = useState<Board | null>(null)
  // 유형별 추천 칸 (T-183) — 고르지 않은 유형은 전부 체크한 상태로 시작
  const presetsQuery = useBoardPresets()
  const [presetPicks, setPresetPicks] = useState<Partial<Record<BoardType, string[]>>>({})
  const [createdPresets, setCreatedPresets] = useState(0)
  const presets = presetsQuery.data?.[boardType] ?? []
  const pickedPresets = presetPicks[boardType] ?? presets.map((p) => p.key)
  // 추천 칸을 못 불러왔으면 보내지 않는다 — 칸은 만든 뒤 필드 관리에서
  const sendPresets = presetsQuery.isSuccess ? pickedPresets : []
  const togglePreset = (key: string, checked: boolean) =>
    setPresetPicks((picks) => ({
      ...picks,
      [boardType]: checked
        ? [...pickedPresets, key]
        : pickedPresets.filter((picked) => picked !== key),
    }))

  const limits = limitsQuery.data
  const last = STEPS.length - 1

  const next = () => {
    if (step === 0) {
      const found = {
        name: name.trim() ? undefined : '이름을 입력해주세요.',
        slug: slug ? boardSlugError(slug) : undefined,
      }
      setErrors(found)
      if (found.name || found.slug) return
    }
    setStep(step + 1)
  }

  const cancel = () => {
    const typed = name.trim() || description.trim() || slug
    if (typed && !window.confirm('게시판 만들기를 그만둘까요? 입력한 내용은 저장되지 않습니다.'))
      return
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
      })
      setCreatedPresets(sendPresets.length)
      setCreated(board)
    } catch (error) {
      toast.error(pickErrorMessage(error, '게시판을 만들지 못했습니다.'))
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
            {STEPS.map((label, i) => (
              <li
                key={label}
                aria-current={i === step ? 'step' : undefined}
                className={`flex flex-1 flex-col items-center gap-1.5 text-center text-[10px] sm:flex-row sm:text-left sm:text-xs ${
                  i === step ? 'font-semibold text-blue-700' : 'text-slate-400'
                }`}
              >
                <b
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs ${
                    i === step
                      ? 'bg-blue-600 text-white'
                      : i < step
                        ? 'bg-blue-50 text-blue-600'
                        : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {i < step ? '✓' : i + 1}
                </b>
                {label}
              </li>
            ))}
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
                    label="주소 이름"
                    maxLength={60}
                    value={slug}
                    error={errors.slug}
                    placeholder="예: news"
                    helperText="비워 두면 자동으로 만듭니다. 영문 소문자 · 숫자 · 하이픈만 쓸 수 있습니다."
                    onChange={(e) => setSlug(e.target.value)}
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
                      {BOARD_TYPES.map((type) => (
                        <label
                          key={type.value}
                          className={`relative cursor-pointer rounded-lg border p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 ${
                            boardType === type.value
                              ? 'border-blue-600 bg-blue-50/60'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="board_type"
                            className="sr-only"
                            checked={boardType === type.value}
                            onChange={() => setBoardType(type.value)}
                          />
                          <TypeSketch type={type.value} />
                          <span className="block text-sm font-semibold text-slate-800">
                            {type.label}
                          </span>
                          <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                            {type.hint}
                          </span>
                          {boardType === type.value && (
                            <span
                              aria-hidden
                              className="absolute right-2.5 top-2 text-sm text-blue-600"
                            >
                              ✓
                            </span>
                          )}
                        </label>
                      ))}
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
                            checked={pickedPresets.includes(preset.key)}
                            onChange={(e) => togglePreset(preset.key, e.target.checked)}
                          />
                          <span>
                            <span className="text-slate-900">{preset.label}</span>{' '}
                            <span className="text-xs text-slate-500">
                              ({fieldTypeLabel(preset.field_type)}
                              {preset.choices.length > 0 && `: ${preset.choices.join(' · ')}`})
                            </span>
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
                    새 게시판은 누구나 읽고, 관리자만 글을 쓰는 설정으로 시작합니다.
                  </p>
                  <div>
                    {DEFAULT_POLICY.map(([label, value]) => (
                      <SummaryRow key={label} label={label} value={value} />
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">
                    회원 글쓰기, 비밀글, 새 글 알림은 만든 뒤 권한 · 운영 설정에서 바꿀 수 있어요.
                  </p>
                </>
              )}

              {step === 4 && (
                <>
                  <p className={HINT}>
                    입력한 내용을 확인해 주세요. 아래 버튼을 누르면 게시판이 만들어집니다.
                  </p>
                  <div>
                    <SummaryRow label="게시판 이름" value={name.trim()} />
                    <SummaryRow label="주소 이름" value={slug || '자동으로 만듦'} />
                    {description.trim() && <SummaryRow label="설명" value={description.trim()} />}
                    <SummaryRow label="유형" value={boardTypeLabel(boardType)} />
                    <SummaryRow
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
                    />
                    <SummaryRow label="권한" value="누구나 읽기 / 관리자 글쓰기" />
                  </div>
                </>
              )}

              <div className="flex items-center gap-2 border-t border-slate-200 pt-5">
                {step > 0 && (
                  <Button type="button" variant="secondary" onClick={() => setStep(step - 1)}>
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
