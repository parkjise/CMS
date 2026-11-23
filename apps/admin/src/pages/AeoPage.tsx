import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { CircleCheck, CircleHelp, Plus, TriangleAlert } from 'lucide-react'
import type { AeoBoard, AeoItem } from '@cms/types'
import { Toggle, toast } from '@cms/ui'
import { ReadOnlyFieldset } from '@/components/layout/ReadOnlyFieldset'
import { LeaveGuard } from '@/components/site/LeaveGuard'
import { SaveBar } from '@/components/site/SaveBar'
import { SITE_HINTS } from '@/components/layout/navigation'
import { SITE_CARD, SitePage } from '@/components/site/SitePage'
import { useAeo, useUpdateAeo } from '@/hooks/useSearchSettings'
import { pickErrorMessage } from '@/lib/errorMessages'

const LINK = 'text-sm font-medium text-blue-600 hover:underline'

/** 홈페이지에 넣는 FAQPage 구조화 데이터와 같은 모양 — 미리보기용 */
const faqJsonLd = (items: AeoItem[]) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: items.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: { '@type': 'Answer', text: item.answer },
  })),
})

/** 켤 수 없는 까닭 — 검색엔진이 이 게시판 글을 볼 수 없다 */
const blockedReason = (board: AeoBoard): string | null => {
  if (!board.active) return '사용 안 함 상태라 홈페이지에 없는 게시판이에요.'
  if (board.member_only) return '회원만 읽는 게시판이라 검색엔진이 글을 볼 수 없어요.'
  return null
}

interface BoardCardProps {
  board: AeoBoard
  on: boolean
  onToggle: (on: boolean) => void
}

function BoardCard({ board, on, onToggle }: BoardCardProps) {
  const blocked = blockedReason(board)
  const included = board.items.filter((item) => item.public)
  const excluded = board.items.length - included.length

  return (
    <section className={SITE_CARD} aria-labelledby={`aeo-${board.id}`}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 id={`aeo-${board.id}`} className="mr-auto text-base font-semibold text-slate-900">
          {board.name}
          <span className="ml-2 text-xs font-normal text-slate-400">/b/{board.slug}</span>
        </h2>
        <Link
          to={`/admin/boards/${board.id}/posts/new`}
          className={`${LINK} inline-flex items-center gap-1`}
        >
          <Plus className="h-4 w-4" aria-hidden />
          질문 추가
        </Link>
      </div>

      {board.items.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          아직 질문이 없어요. [질문 추가]로 첫 질문을 써 보세요.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="w-12 py-2 font-medium">순서</th>
                <th className="py-2 font-medium">질문</th>
                <th className="w-40 py-2 font-medium">구조화 데이터</th>
                <th className="w-14 py-2" aria-label="수정" />
              </tr>
            </thead>
            <tbody>
              {board.items.map((item, index) => (
                <tr key={item.post_id} className="border-b border-slate-100 align-top">
                  <td className="py-2.5 text-slate-400">{index + 1}</td>
                  <td className="py-2.5">
                    <p className="font-medium text-slate-800">{item.question}</p>
                    {item.answer && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{item.answer}</p>
                    )}
                  </td>
                  <td className="py-2.5">
                    {item.public ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <CircleCheck className="h-4 w-4" aria-hidden />
                        넣음
                      </span>
                    ) : (
                      <span className="text-slate-400">빠짐 · {item.note}</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right">
                    <Link
                      to={`/admin/boards/${board.id}/posts/${item.post_id}/edit`}
                      className={LINK}
                    >
                      수정
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-3 rounded-lg border border-slate-200 p-4">
        <Toggle
          checked={on && !blocked}
          disabled={Boolean(blocked)}
          onChange={(event) => onToggle(event.target.checked)}
          label="FAQ 구조화 데이터 만들기"
          description="이 게시판 화면에 보이는 질문 · 답변을 검색엔진과 AI 답변 서비스가 읽는 형식(FAQPage)으로 함께 내보냅니다."
        />
        {blocked && (
          <p className="flex items-start gap-1.5 text-xs text-amber-700" role="note">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {blocked}
          </p>
        )}
        {on && !blocked && (
          <>
            <p className="text-xs text-slate-500" role="status">
              검사 결과: 질문 {included.length}개를 넣어요
              {excluded > 0 && ` · ${excluded}개는 공개 전 · 비밀글이라 빠져요`}. 한 화면에 보이는
              질문만 그 화면에 넣습니다.
            </p>
            {included.length > 0 && (
              <details>
                <summary className="cursor-pointer text-xs font-medium text-slate-600">
                  생성 결과 보기
                </summary>
                <pre className="mt-2 max-h-72 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
                  {JSON.stringify(faqJsonLd(included), null, 2)}
                </pre>
              </details>
            )}
          </>
        )}
      </div>
    </section>
  )
}

const sameIds = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id) => b.includes(id))

/** 사이트 관리 → AEO 설정 (T-221, SM-05) — FAQ 게시판 글이 질문 · 답변의 원본 */
export function AeoPage() {
  const query = useAeo()
  const save = useUpdateAeo()
  const [selected, setSelected] = useState<string[]>([])
  const saved = query.data?.faq_board_ids ?? []
  const dirty = Boolean(query.data) && !sameIds(selected, saved)

  useEffect(() => {
    if (query.data) setSelected(query.data.faq_board_ids)
  }, [query.data])

  const toggle = (id: string, on: boolean) =>
    setSelected((ids) => (on ? [...ids.filter((x) => x !== id), id] : ids.filter((x) => x !== id)))

  // 성공 여부를 돌려준다 — 나가기 확인의 [저장하고 이동] (T-227)
  const handleSave = async () => {
    try {
      await save.mutateAsync(selected)
      toast.success('AEO 설정을 저장했습니다. 홈페이지에 바로 반영돼요.')
      return true
    } catch (error) {
      toast.error(pickErrorMessage(error, '저장하지 못했습니다.'))
      return false
    }
  }

  return (
    <SitePage
      title="AEO 설정"
      summary={SITE_HINTS.aeo}
      description="자주 묻는 질문을 검색엔진과 AI 답변 서비스가 읽기 쉬운 형식으로 내보내요. 질문 · 답변은 FAQ 게시판에서 쓰고, 여기서는 연결만 합니다."
    >
      <p
        className="flex items-start gap-2 rounded-lg bg-slate-100 px-4 py-3 text-xs leading-relaxed text-slate-500"
        role="note"
      >
        <CircleHelp className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        화면에 보이는 질문과 같은 내용만 내보내요. 검색 노출이나 AI 답변 인용을 보장하지는 않습니다.
      </p>
      {query.isError && <p className="text-sm text-red-600">AEO 설정을 불러오지 못했습니다.</p>}
      {query.isLoading && <div className="h-72 animate-pulse rounded-lg bg-slate-100" />}
      {query.data && query.data.boards.length === 0 && (
        <section className={`${SITE_CARD} text-center`}>
          <p className="text-sm text-slate-600">FAQ 게시판이 아직 없어요.</p>
          <Link to="/admin/boards/new?example=faq" className={LINK}>
            FAQ 게시판 만들기
          </Link>
        </section>
      )}
      {query.data && query.data.boards.length > 0 && (
        <>
          <ReadOnlyFieldset className="min-w-0 space-y-6">
            {query.data.boards.map((board) => (
              <BoardCard
                key={board.id}
                board={board}
                on={selected.includes(board.id)}
                onToggle={(on) => toggle(board.id, on)}
              />
            ))}
          </ReadOnlyFieldset>
          {/* 연결할 FAQ 게시판이 없으면 저장할 것도 없다 */}
          <SaveBar
            dirty={dirty}
            saving={save.isPending}
            onReset={() => setSelected(saved)}
            onSave={() => void handleSave()}
          />
        </>
      )}
      <LeaveGuard dirty={dirty} onSave={handleSave} />
    </SitePage>
  )
}
