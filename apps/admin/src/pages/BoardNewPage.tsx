import { useState } from 'react'
import { Link } from 'react-router'
import type { Board, BoardStatus, BoardType } from '@cms/types'
import { Button, Input, Textarea, toast } from '@cms/ui'
import { useBoardLimits, useCreateBoard } from '@/hooks/useBoards'
import { BOARD_TYPES, NOT_SHOWN_YET, boardSlugError } from '@/lib/boardLabels'
import { pickErrorMessage } from '@/lib/errorMessages'

const STEPS = ['기본 정보', '유형', '공개 여부'] as const

/** 게시판 추가 마법사 (BM-02) — 어려운 칸은 고급 설정으로 */
export function BoardNewPage() {
  const limitsQuery = useBoardLimits()
  const createBoard = useCreateBoard()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [slug, setSlug] = useState('')
  const [boardType, setBoardType] = useState<BoardType>('LIST')
  const [status, setStatus] = useState<BoardStatus>('ACTIVE')
  const [errors, setErrors] = useState<{ name?: string; slug?: string }>({})
  const [created, setCreated] = useState<Board | null>(null)

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
      })
      setCreated(board)
    } catch (error) {
      toast.error(pickErrorMessage(error, '게시판을 만들지 못했습니다.'))
    }
  }

  if (created) {
    return (
      <div className="mx-auto max-w-2xl space-y-5 p-6 md:p-8">
        <h1 className="text-2xl font-bold text-slate-900">게시판을 만들었습니다</h1>
        <p className="text-sm text-slate-600">
          <strong className="text-slate-900">{created.name}</strong> 의 주소 이름은{' '}
          <code>{created.slug}</code> 입니다.
        </p>
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">{NOT_SHOWN_YET}</p>
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/admin/boards/${created.id}/posts/new`}
            className="inline-flex h-10 items-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
          >
            첫 글 쓰기
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
    <div className="mx-auto max-w-2xl space-y-5 p-6 md:p-8">
      <div>
        <Link to="/admin/boards" className="text-sm text-slate-500 hover:text-slate-700">
          ← 게시판 관리
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">게시판 추가</h1>
      </div>

      {limits && !limits.can_create ? (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p>{limits.reason}</p>
          <Link to="/admin/billing" className="font-medium underline">
            요금제 보기
          </Link>
        </div>
      ) : (
        <>
          <ol className="flex gap-2 text-sm" aria-label="진행 단계">
            {STEPS.map((label, i) => (
              <li
                key={label}
                aria-current={i === step ? 'step' : undefined}
                className={`rounded-full px-3 py-1 ${
                  i === step ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {i + 1}. {label}
              </li>
            ))}
          </ol>

          <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
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
                <legend className="mb-2 text-sm font-medium text-slate-700">어떤 모양으로 보여 줄까요?</legend>
                {BOARD_TYPES.map((type) => (
                  <label
                    key={type.value}
                    className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 p-3 hover:bg-slate-50"
                  >
                    <input
                      type="radio"
                      name="board_type"
                      className="mt-1"
                      checked={boardType === type.value}
                      onChange={() => setBoardType(type.value)}
                    />
                    <span>
                      <span className="block text-sm font-medium text-slate-900">{type.label}</span>
                      <span className="block text-xs text-slate-500">{type.hint}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}

            {step === 2 && (
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium text-slate-700">바로 사용할까요?</legend>
                <label className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-200 p-3">
                  <input
                    type="radio"
                    name="status"
                    checked={status === 'ACTIVE'}
                    onChange={() => setStatus('ACTIVE')}
                  />
                  <span className="text-sm text-slate-900">사용</span>
                </label>
                <label className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-200 p-3">
                  <input
                    type="radio"
                    name="status"
                    checked={status === 'INACTIVE'}
                    onChange={() => setStatus('INACTIVE')}
                  />
                  <span className="text-sm text-slate-900">사용 안 함 (글을 준비한 뒤 켜기)</span>
                </label>
              </fieldset>
            )}
          </div>

          <div className="flex justify-between">
            <Button
              type="button"
              variant="ghost"
              disabled={step === 0}
              onClick={() => setStep(step - 1)}
            >
              이전
            </Button>
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
        </>
      )}
    </div>
  )
}
