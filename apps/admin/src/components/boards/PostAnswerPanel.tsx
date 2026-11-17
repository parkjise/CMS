import { useState } from 'react'
import dayjs from 'dayjs'
import type { Post } from '@cms/types'
import { Button, toast } from '@cms/ui'
import { CARD } from '@/components/boards/boardStyles'
import { useAnswerPost } from '@/hooks/useBoards'
import { useCanEdit } from '@/hooks/useCanEdit'
import { pickErrorMessage } from '@/lib/errorMessages'

const ANSWER_MAX = 5000

interface PostAnswerPanelProps {
  boardId: string
  post: Post
}

/** 문의형 관리자 답변 (T-219) — 글 저장과 따로 저장한다. 비밀글이면 답변도 작성자만 본다 */
export const PostAnswerPanel = ({ boardId, post }: PostAnswerPanelProps) => {
  const canEdit = useCanEdit()
  const answerPost = useAnswerPost(boardId)
  const [answer, setAnswer] = useState(post.answer ?? '')
  const [answeredAt, setAnsweredAt] = useState(post.answered_at ?? null)

  const save = async (text: string) => {
    try {
      const saved = await answerPost.mutateAsync({ id: post.id, answer: text })
      setAnswer(saved.answer ?? '')
      setAnsweredAt(saved.answered_at ?? null)
      toast.success(saved.answer ? '답변을 저장했습니다.' : '답변을 지웠습니다.')
    } catch (err) {
      toast.error(pickErrorMessage(err, '답변을 저장하지 못했습니다.'))
    }
  }

  return (
    <section aria-labelledby="post-answer-title" className={`space-y-3 ${CARD}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="post-answer-title" className="text-sm font-semibold text-slate-900">
          관리자 답변
        </h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            answeredAt ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {answeredAt ? `답변 완료 · ${dayjs(answeredAt).format('YYYY.MM.DD HH:mm')}` : '답변 대기'}
        </span>
      </div>
      <label htmlFor="post-answer" className="sr-only">
        답변 내용
      </label>
      <textarea
        id="post-answer"
        className="min-h-32 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50"
        maxLength={ANSWER_MAX}
        value={answer}
        disabled={!canEdit}
        placeholder="홈페이지 글 아래에 보일 답변을 적어 주세요. 빈 줄로 문단을 나눕니다."
        onChange={(e) => setAnswer(e.target.value)}
      />
      <p className="text-xs text-slate-500">
        {post.is_secret
          ? '비밀글이라 답변도 글쓴이와 관리자만 볼 수 있어요.'
          : '답변은 홈페이지 글 아래에 공개됩니다.'}{' '}
        개인 상담은 문의 관리(온라인 상담)를 써 주세요.
      </p>
      {canEdit && (
        <div className="flex justify-end gap-2">
          {answeredAt && (
            <Button
              type="button"
              variant="ghost"
              disabled={answerPost.isPending}
              onClick={() => void save('')}
            >
              답변 지우기
            </Button>
          )}
          <Button
            type="button"
            loading={answerPost.isPending}
            disabled={!answer.trim()}
            onClick={() => void save(answer)}
          >
            답변 저장
          </Button>
        </div>
      )}
    </section>
  )
}
