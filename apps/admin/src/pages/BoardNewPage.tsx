import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { Board, BoardStatus, BoardType } from '@cms/types'
import { Button, Input, Textarea, toast } from '@cms/ui'
import { useBoardLimits, useBoardPresets, useCreateBoard } from '@/hooks/useBoards'
import { BoardPageTitle } from '@/components/boards/BoardPageTitle'
import { useCanEdit } from '@/hooks/useCanEdit'
import { BOARD_EXAMPLES } from '@/lib/boardExamples'
import { BOARD_TYPES, boardSlugError } from '@/lib/boardLabels'
import { fieldTypeLabel } from '@/lib/customFields'
import { pickErrorMessage } from '@/lib/errorMessages'

const STEPS = ['기본 정보', '유형', '공개 여부'] as const

/** 게시판 추가 마법사 (BM-02) — 어려운 칸은 고급 설정으로 */
export function BoardNewPage() {
  const canEdit = useCanEdit()
  const limitsQuery = useBoardLimits()
  const createBoard = useCreateBoard()
  const [searchParams] = useSearchParams()
  const example = BOARD_EXAMPLES.find((item) => item.id === searchParams.get('example'))
  const [step, setStep] = useState(0)
  const [name, setName] = useState(example?.name ?? '')
  const [description, setDescription] = useState(example?.description ?? '')
  const [slug, setSlug] = useState('')
  const [boardType, setBoardType] = useState<BoardType>(example?.board_type ?? 'LIST')
  const [status, setStatus] = useState<BoardStatus>('ACTIVE')
  const [inMenu, setInMenu] = useState(true)
  const [errors, setErrors] = useState<{ name?: string; slug?: string }>({})
  const [created, setCreated] = useState<Board | null>(null)
  // 유형별 추천 칸 (T-183) — 고르지 않은 유형은 전부 체크한 상태로 시작
  const presetsQuery = useBoardPresets()
  const [presetPicks, setPresetPicks] = useState<Partial<Record<BoardType, string[]>>>({})
  const [createdPresets, setCreatedPresets] = useState(0)
  const presets = presetsQuery.data?.[boardType] ?? []
  const pickedPresets = presetPicks[boardType] ?? presets.map((p) => p.key)
  const togglePreset = (key: string, checked: boolean) =>
    setPresetPicks((picks) => ({
      ...picks,
      [boardType]: checked
        ? [...pickedPresets, key]
        : pickedPresets.filter((picked) => picked !== key),
    }))

  const limits = limitsQuery.data

  const nextFromBasic = () => {
    const next = {
      name: name.trim() ? undefined : '이름을 입력해주세요.',
      slug: slug ? boardSlugError(slug) : undefined,
    }
    setErrors(next)
    if (!next.name && !next.slug) setStep(1)
  }

  const submit = async () => {
    try {
      const board = await createBoard.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        slug: slug || undefined,
        board_type: boardType,
        status,
        in_menu: inMenu,
        // 추천 칸을 못 불러왔으면 보내지 않는다 — 칸은 만든 뒤 필드 관리에서
        preset_fields: presetsQuery.isSuccess ? pickedPresets : [],
      })
      setCreatedPresets(presetsQuery.isSuccess ? pickedPresets.length : 0)
      setCreated(board)
    } catch (error) {
      toast.error(pickErrorMessage(error, '게시판을 만들지 못했습니다.'))
    }
  }

  if (created) {
    return (
      <div className="mx-auto w-full max-w-[1480px] space-y-6 p-6 md:p-8">
        <h1 className="text-[26px] font-bold tracking-tight text-slate-900">
          게시판을 만들었습니다
        </h1>
        <p className="text-sm text-slate-600">
          <strong className="text-slate-900">{created.name}</strong> 의 주소 이름은{' '}
          <code>{created.slug}</code> 입니다.
        </p>
        <p className="rounded-md bg-blue-50 p-3 text-sm text-blue-800">
          {created.status !== 'ACTIVE'
            ? '사용으로 바꾸면 홈페이지 상단 메뉴에 나옵니다.'
            : inMenu
              ? '홈페이지 상단 메뉴에 추가했습니다.'
              : '상단 메뉴에는 넣지 않았습니다.'}{' '}
          메뉴 이름과 보이기는 공통 설정의 상단 메뉴에서 바꿀 수 있습니다.
        </p>
        {createdPresets > 0 && (
          <p className="text-sm text-slate-600">
            추천 칸 {createdPresets}개를 함께 만들었습니다. 이름 · 선택지 · 순서는 칸 설정에서 바꿀
            수 있습니다.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/admin/boards/${created.id}/posts/new`}
            className="inline-flex h-10 items-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
          >
            첫 글 쓰기
          </Link>
          <Link
            to={`/admin/boards/${created.id}/fields`}
            className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50"
          >
            칸 설정
          </Link>
          <Link
            to={`/admin/boards/${created.id}/settings`}
            className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50"
          >
            게시판 설정
          </Link>
          <Link
            to="/admin/boards"
            className="inline-flex h-10 items-center rounded-md px-4 text-sm text-slate-600 hover:bg-slate-100"
          >
            목록으로
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-6 p-6 md:p-8">
      <BoardPageTitle
        title="게시판 만들기"
        description="이름과 유형을 고르고, 추천 칸을 확인하면 게시판이 만들어져요. 권한 · 운영 설정은 만든 뒤에 바꿀 수 있어요."
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
            <p className="rounded-md bg-blue-50 p-3 text-sm text-blue-800">
              ‘{example.name}’ 예시에서 시작합니다. 이름, 설명, 모양을 바꿀 수 있습니다.
            </p>
          )}
          <ol
            className="flex gap-2 rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
            aria-label="진행 단계"
          >
            {STEPS.map((label, i) => (
              <li
                key={label}
                aria-current={i === step ? 'step' : undefined}
                className={`flex flex-1 flex-col items-center gap-1.5 text-center text-[11px] sm:flex-row sm:text-left sm:text-xs ${
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
            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-slate-800">
                {
                  ['기본 정보를 입력해 주세요', '게시판 유형을 고르세요', '공개 여부를 정하세요'][
                    step
                  ]
                }
              </h2>
              {step === 0 && (
                <>
                  <Input
                    label="게시판 이름"
                    required
                    maxLength={100}
                    value={name}
                    error={errors.name}
                    placeholder="예: 병원 소식"
                    onChange={(e) => setName(e.target.value)}
                  />
                  <Textarea
                    label="설명 (선택)"
                    rows={2}
                    maxLength={200}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                  <details className="text-sm text-slate-600">
                    <summary className="cursor-pointer">고급 설정</summary>
                    <div className="mt-3">
                      <Input
                        label="주소 이름"
                        maxLength={60}
                        value={slug}
                        error={errors.slug}
                        helperText="비워 두면 자동으로 만듭니다. 영문 소문자 · 숫자 · 하이픈만 쓸 수 있습니다."
                        onChange={(e) => setSlug(e.target.value)}
                      />
                    </div>
                  </details>
                </>
              )}

              {step === 1 && (
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-sm font-medium text-slate-700">
                    어떤 모양으로 보여 줄까요?
                  </legend>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {BOARD_TYPES.map((type) => (
                      <label
                        key={type.value}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 ${
                          boardType === type.value
                            ? 'border-blue-600 bg-blue-50/60'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="board_type"
                          className="mt-1"
                          checked={boardType === type.value}
                          onChange={() => setBoardType(type.value)}
                        />
                        <span>
                          <span className="block text-sm font-medium text-slate-900">
                            {type.label}
                          </span>
                          <span className="block text-xs text-slate-500">{type.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {presets.length > 0 && (
                    <fieldset className="mt-4 space-y-2 rounded-lg bg-slate-50 p-4">
                      <legend className="text-sm font-medium text-slate-700">
                        함께 만들 추천 칸
                      </legend>
                      <p className="text-xs text-slate-500">
                        필요 없는 칸은 체크를 풀어 주세요. 만든 뒤에도 칸 설정에서 고칠 수 있습니다.
                      </p>
                      {presets.map((preset) => (
                        <label key={preset.key} className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-0.5"
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
                    <p className="mt-3 text-xs text-slate-500">
                      추천 칸을 불러오지 못했습니다. 칸은 만든 뒤 칸 설정에서 추가할 수 있습니다.
                    </p>
                  )}
                </fieldset>
              )}

              {step === 2 && (
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-sm font-medium text-slate-700">
                    바로 사용할까요?
                  </legend>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3.5">
                    <input
                      type="radio"
                      name="status"
                      checked={status === 'ACTIVE'}
                      onChange={() => setStatus('ACTIVE')}
                    />
                    <span className="text-sm text-slate-900">사용</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3.5">
                    <input
                      type="radio"
                      name="status"
                      checked={status === 'INACTIVE'}
                      onChange={() => setStatus('INACTIVE')}
                    />
                    <span className="text-sm text-slate-900">사용 안 함 (글을 준비한 뒤 켜기)</span>
                  </label>
                  {status === 'ACTIVE' && (
                    <label className="flex cursor-pointer items-center gap-3 pt-2">
                      <input
                        type="checkbox"
                        checked={inMenu}
                        onChange={(e) => setInMenu(e.target.checked)}
                      />
                      <span className="text-sm text-slate-900">홈페이지 상단 메뉴에 추가</span>
                    </label>
                  )}
                </fieldset>
              )}
              <div className="flex items-center gap-2 border-t border-slate-200 pt-5">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={step === 0}
                  onClick={() => setStep(step - 1)}
                >
                  이전
                </Button>
                <span className="flex-1" />
                <span className="text-xs text-slate-400">
                  {step + 1} / {STEPS.length}
                </span>
                {step === 0 && (
                  <Button type="button" onClick={nextFromBasic}>
                    다음
                  </Button>
                )}
                {step === 1 && (
                  <Button type="button" onClick={() => setStep(2)}>
                    다음
                  </Button>
                )}
                {step === 2 && (
                  <Button type="button" loading={createBoard.isPending} onClick={submit}>
                    만들기
                  </Button>
                )}
              </div>
            </div>
            <aside className="hidden rounded-xl border border-slate-200 bg-white p-6 text-xs leading-relaxed text-slate-500 shadow-sm xl:block">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">게시판 구성 안내</h2>
              <p>
                게시판은 글을 담는 공간이에요. 이름과 유형을 먼저 정하고, 글은 만든 뒤에 쓰면 돼요.
              </p>
              <hr className="my-4 border-slate-200" />
              <p>
                읽기 · 쓰기 권한, 비밀글, 알림 같은 운영 설정은 만든 뒤 권한 · 운영 설정에서 바꿀 수
                있어요.
              </p>
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
