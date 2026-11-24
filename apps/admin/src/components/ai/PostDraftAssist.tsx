import { useState } from 'react'
import { Sparkles, TriangleAlert } from 'lucide-react'
import { Button, Textarea } from '@cms/ui'
import { AiDrawer } from '@/components/ai/AiDrawer'
import { useAiAssist, useAiAssistEnabled } from '@/hooks/useAiAssist'
import { AI_BOARD_ASSIST, type DraftBlock, MEMO_MAX, hasNumber } from '@/lib/aiAssist'
import type { DraftMode } from '@/lib/aiPostDraft'
import { pickErrorMessage } from '@/lib/errorMessages'

/** 관리자가 고른 것 — 고르지 않은 칸은 null */
export interface PostDraftPick {
  title: string | null
  body: DraftBlock[] | null
  mode: DraftMode
}

interface PostDraftAssistProps {
  boardId: string
  /** FAQ 게시판 — 제목은 질문, 본문은 답변 */
  faq: boolean
  currentTitle: string
  bodyEmpty: boolean
  /** AEO [✨ 질문 초안] 으로 들어오면 서랍을 열고 시작 */
  defaultOpen?: boolean
  onApply: (pick: PostDraftPick) => void
}

type BodyChoice = DraftMode | 'keep'

const SECTION = 'mb-2 text-sm font-medium text-slate-700'
const OPTION = 'flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm'

const blocksText = (blocks: DraftBlock[]) =>
  blocks.map((b) => (b.type === 'p' ? b.text : b.items.join('\n'))).join('\n')

/** 글쓰기 편집기 툴바 [✨ AI 초안] + 결과 서랍 (기획서 A-3, T-233-A) */
export function PostDraftAssist({
  boardId,
  faq,
  currentTitle,
  bodyEmpty,
  defaultOpen = false,
  onApply,
}: PostDraftAssistProps) {
  const enabled = useAiAssistEnabled(AI_BOARD_ASSIST)
  const assist = useAiAssist('post')
  const [open, setOpen] = useState(defaultOpen)
  const [memo, setMemo] = useState('')
  // 고른 제목 후보 — -1 이면 지금 제목 그대로
  const [titleIndex, setTitleIndex] = useState(-1)
  const [bodyChoice, setBodyChoice] = useState<BodyChoice>('append')
  if (!enabled) return null

  const result = assist.data?.result
  const titleWord = faq ? '질문' : '제목'
  const bodyWord = faq ? '답변' : '본문'
  const hasTitle = Boolean(currentTitle.trim())

  const generate = () =>
    assist.mutate(
      { memo: memo.trim(), board_id: boardId },
      {
        // 지금 제목은 덮어쓰지 않게 처음엔 고르지 않는다. 본문은 비어 있으면 바로 넣는다
        onSuccess: ({ result: next }) => {
          setTitleIndex(hasTitle || next.titles.length === 0 ? -1 : 0)
          setBodyChoice(bodyEmpty ? 'replace' : 'append')
        },
      }
    )

  const title = result && titleIndex >= 0 ? (result.titles[titleIndex] ?? null) : null
  const takeBody = Boolean(result?.body.length) && bodyChoice !== 'keep'
  const canApply = Boolean(title) || takeBody

  const apply = () => {
    if (!result) return
    onApply({
      title,
      body: takeBody ? result.body : null,
      mode: bodyChoice === 'keep' ? 'append' : bodyChoice,
    })
    setOpen(false)
  }

  const numbers = result && (result.titles.some(hasNumber) || hasNumber(blocksText(result.body)))

  return (
    <>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          assist.reset()
          setOpen(true)
        }}
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50"
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        AI 초안
      </button>
      <AiDrawer
        open={open}
        onClose={() => setOpen(false)}
        title={faq ? 'AI 로 질문 · 답변 초안 만들기' : 'AI 로 글 초안 만들기'}
        usage={assist.data?.usage}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              닫기
            </Button>
            {result && (
              <Button
                type="button"
                variant="secondary"
                loading={assist.isPending}
                disabled={!memo.trim()}
                onClick={generate}
              >
                다시 만들기
              </Button>
            )}
            {result ? (
              <Button type="button" disabled={!canApply} onClick={apply}>
                편집 칸에 넣기
              </Button>
            ) : (
              <Button
                type="button"
                loading={assist.isPending}
                disabled={!memo.trim()}
                onClick={generate}
              >
                초안 만들기
              </Button>
            )}
          </>
        }
      >
        <Textarea
          label={faq ? '어떤 질문에 답할까요?' : '어떤 글을 쓸까요?'}
          rows={4}
          maxLength={MEMO_MAX}
          value={memo}
          placeholder={
            faq
              ? '예: 주차 되나요? 지하 주차장, 진료 받으면 2시간 무료'
              : '예: 추석 연휴 9/14~9/18 휴진, 응급은 카카오 채널'
          }
          helperText={`날짜 · 시간 · 연락 방법처럼 꼭 들어갈 내용을 적어 주세요. 사업체 이름 · 연락처는 사이트 기본정보에서 가져와요. (${memo.length}/${MEMO_MAX})`}
          onChange={(e) => setMemo(e.target.value)}
        />

        {assist.isPending && <div className="h-40 animate-pulse rounded-lg bg-slate-100" />}
        {assist.isError && (
          <p className="text-sm text-rose-600" role="alert">
            {pickErrorMessage(
              assist.error,
              'AI 가 알맞은 답을 주지 못했어요. 잠시 뒤 다시 시도해 주세요.'
            )}
          </p>
        )}
        {result && !assist.isPending && (
          <div className="space-y-4" aria-label="AI 초안">
            {numbers && (
              <p className="flex items-start gap-1.5 text-xs text-amber-700" role="note">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                숫자 · 날짜가 메모와 같은지 확인해 주세요.
              </p>
            )}

            {result.titles.length > 0 && (
              <fieldset>
                <legend className={SECTION}>
                  {result.titles.length > 1
                    ? `${titleWord} 후보 ${result.titles.length}개`
                    : titleWord}
                </legend>
                <div className="space-y-2">
                  {result.titles.map((text, index) => (
                    <label key={text} className={OPTION}>
                      <input
                        type="radio"
                        name="ai-draft-title"
                        className="mt-1"
                        checked={titleIndex === index}
                        onChange={() => setTitleIndex(index)}
                      />
                      <span className="min-w-0 flex-1 font-medium text-slate-800">{text}</span>
                    </label>
                  ))}
                  {hasTitle && (
                    <label className={OPTION}>
                      <input
                        type="radio"
                        name="ai-draft-title"
                        className="mt-1"
                        checked={titleIndex === -1}
                        onChange={() => setTitleIndex(-1)}
                      />
                      <span className="min-w-0 flex-1 text-slate-600">
                        지금 {titleWord} 그대로
                        <span className="block text-xs text-slate-400">{currentTitle.trim()}</span>
                      </span>
                    </label>
                  )}
                </div>
              </fieldset>
            )}

            {result.body.length > 0 && (
              <section>
                <h3 className={SECTION}>{bodyWord}</h3>
                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">
                  {result.body.map((block, index) =>
                    block.type === 'p' ? (
                      <p key={index} className="whitespace-pre-line">
                        {block.text}
                      </p>
                    ) : (
                      <ul key={index} className="list-disc pl-5">
                        {block.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    )
                  )}
                </div>
                {!bodyEmpty && (
                  <fieldset className="mt-3">
                    <legend className="mb-2 text-xs text-slate-600">
                      지금 {bodyWord}이 있어요. 뒤에 붙일까요, 바꿀까요?
                    </legend>
                    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-700">
                      {(
                        [
                          ['append', '뒤에 붙이기'],
                          ['replace', `${bodyWord} 바꾸기`],
                          ['keep', '그대로 두기'],
                        ] as const
                      ).map(([value, label]) => (
                        <label key={value} className="inline-flex items-center gap-2">
                          <input
                            type="radio"
                            name="ai-draft-body"
                            checked={bodyChoice === value}
                            onChange={() => setBodyChoice(value)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
              </section>
            )}
          </div>
        )}
      </AiDrawer>
    </>
  )
}
