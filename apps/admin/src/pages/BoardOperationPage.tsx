import type { Board, BoardOperation, BoardPermissions, ReportHideCount } from '@cms/types'
import { Toggle } from '@cms/ui'
import { ReadOnlyFieldset } from '@/components/layout/ReadOnlyFieldset'
import { usePermissionOptions } from '@/hooks/useBoards'

// 신고 자동 비공개 기준 (T-175) — 저장하지 않은 게시판은 5
const DEFAULT_REPORT_HIDE_COUNT: ReportHideCount = 5
const REPORT_HIDE_OPTIONS: { value: ReportHideCount; label: string }[] = [
  { value: 0, label: '자동으로 숨기지 않음 (알림만)' },
  { value: 3, label: '3건' },
  { value: 5, label: '5건 (기본)' },
  { value: 10, label: '10건' },
]

const CARD_CLASS = 'space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm'

interface BoardOperationFieldsProps {
  board: Board
  value: BoardOperation
  onChange: (change: Partial<BoardOperation>) => void
  /** 권한 구역에서 고친 값 — 안내가 바로 따라간다 */
  permissions: BoardPermissions
}

/** 운영 설정 구역 (BM-11, T-151) — 저장은 게시판 설정 아래 저장 막대에서 한 번에 (T-228) */
export function BoardOperationFields({
  board,
  value: operation,
  onChange: change,
  permissions,
}: BoardOperationFieldsProps) {
  const memberWrite = permissions.write === 'MEMBER'
  // 비회원 글쓰기도 회원 글쓰기와 같은 이유로 막힌다 (병원 업종 · 필수 칸) — 서버가 다시 확인한다
  const guestBlocked = usePermissionOptions(board.id).data?.member_write_blocked ?? null
  const memberOnlyRead = permissions.read === 'MEMBER'

  return (
    <div className="space-y-5">
      {!memberWrite && (
        <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
          아래 설정은 회원이 홈페이지에서 쓰는 글에 쓰입니다. 위 권한에서 글쓰기를 회원도로 바꾸면 적용됩니다.
        </p>
      )}
      <ReadOnlyFieldset>
        <div className={CARD_CLASS}>
          <Toggle
            label="비밀글 허용"
            description="회원이 글쓰기에서 비밀글을 고를 수 있습니다. 홈페이지 목록에는 제목만 보이고, 내용은 쓴 회원과 관리자만 봅니다."
            checked={operation.allow_secret}
            onChange={(e) => change({ allow_secret: e.target.checked })}
          />
          {board.operation.allow_secret && !operation.allow_secret && (
            <p className="text-sm text-amber-700">끄더라도 이미 쓴 비밀글은 그대로 비밀글로 남습니다.</p>
          )}
        </div>
        <div className={`mt-5 ${CARD_CLASS}`}>
          <Toggle
            label="비회원 글쓰기 허용"
            description="로그인하지 않은 방문자도 이름과 글 비밀번호로 글을 씁니다. 개인정보 수집 동의와 자동 등록 방지(reCAPTCHA)를 거치고, 같은 곳에서 1시간에 5개까지 씁니다."
            checked={operation.allow_guest}
            disabled={Boolean(guestBlocked) && !board.operation.allow_guest}
            onChange={(e) => change({ allow_guest: e.target.checked })}
          />
          {guestBlocked && <p className="text-sm text-amber-700">{guestBlocked}</p>}
          {operation.allow_guest && memberOnlyRead && (
            <p className="text-sm text-amber-700">글 읽기가 회원만이라 비회원은 글을 쓸 수 없습니다.</p>
          )}
        </div>
        <div className={`mt-5 ${CARD_CLASS}`}>
          <Toggle
            label="새 글 알림"
            description="회원 · 비회원이 새 글을 쓰면 관리자 화면을 열어 둔 동안 알림이 뜹니다. 제목과 게시판 이름만 보냅니다."
            checked={operation.notify_new_post}
            onChange={(e) => change({ notify_new_post: e.target.checked })}
          />
        </div>
        <div className={`mt-5 ${CARD_CLASS}`}>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-slate-700">신고가 몇 건 모이면 글을 숨길까요</span>
            <select
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm sm:w-72"
              value={operation.report_hide_count ?? DEFAULT_REPORT_HIDE_COUNT}
              onChange={(e) => change({ report_hide_count: Number(e.target.value) as ReportHideCount })}
            >
              {REPORT_HIDE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm text-slate-500">
            방문자가 글을 신고하면 그때마다 관리자 화면에 알림이 뜹니다. 서로 다른 방문자의 신고가 이 수만큼 모이면 글을
            자동으로 비공개로 바꾸고, 신고된 글 화면에서 다시 공개할 수 있습니다. 기준이 낮을수록 여러 사람이 짜고 정상
            글을 숨기기 쉬워집니다.
          </p>
        </div>
      </ReadOnlyFieldset>
    </div>
  )
}
