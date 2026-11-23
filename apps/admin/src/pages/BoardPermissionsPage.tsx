import type { Board, BoardPermissions } from '@cms/types'
import { PermissionMatrix } from '@/components/boards/PermissionMatrix'
import { ReadOnlyFieldset } from '@/components/layout/ReadOnlyFieldset'
import { usePermissionOptions } from '@/hooks/useBoards'
import { type PermissionOption as Option, READ_OPTIONS, WRITE_OPTIONS } from '@/lib/boardPermissions'

const LABEL_CLASS = 'mb-1.5 block text-sm font-medium text-slate-700'
const CARD_CLASS = 'space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm'

interface ChoiceProps<T extends string> {
  name: string
  legend: string
  options: Option<T>[]
  value: T
  /** 회원 값을 고를 수 없는 이유 — 이미 그 값이면 막지 않는다 */
  memberBlocked: string | null
  saved: T
  onChange: (value: T) => void
}

function Choice<T extends string>({ name, legend, options, value, memberBlocked, saved, onChange }: ChoiceProps<T>) {
  return (
    <fieldset>
      <legend className={LABEL_CLASS}>{legend}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => {
          const blocked = option.value === 'MEMBER' && Boolean(memberBlocked) && saved !== 'MEMBER'
          return (
            <label
              key={option.value}
              className={`flex gap-3 rounded-lg border p-3 text-sm ${
                value === option.value ? 'border-blue-600 bg-blue-50' : 'border-slate-200'
              } ${blocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
            >
              <input
                type="radio"
                name={name}
                className="mt-0.5"
                checked={value === option.value}
                disabled={blocked}
                onChange={() => onChange(option.value)}
              />
              <span>
                <span className="block font-medium text-slate-900">{option.label}</span>
                <span className="mt-0.5 block text-slate-500">{option.hint}</span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

interface BoardPermissionFieldsProps {
  board: Board
  value: BoardPermissions
  onChange: (value: BoardPermissions) => void
  /** 운영 설정 구역에서 고친 비회원 글쓰기 — 표가 바로 따라간다 */
  allowGuest: boolean
}

/** 권한 구역 (BM-10, T-150) — 저장은 게시판 설정 아래 저장 막대에서 한 번에 (T-228) */
export function BoardPermissionFields({
  board,
  value: permissions,
  onChange,
  allowGuest,
}: BoardPermissionFieldsProps) {
  // 못 읽었으면 막지 않는다 — 저장할 때 서버가 다시 확인한다
  const options = usePermissionOptions(board.id).data
  const readBlocked = options?.member_read_blocked ?? null
  const writeBlocked = options?.member_write_blocked ?? null
  const saved = board.permissions

  return (
    <div className="space-y-5">
      {/* 역할 × 동작 요약 — 아래에서 고르면 바로 바뀐다 (T-213) */}
      <PermissionMatrix permissions={permissions} allowGuest={allowGuest} />
      <ReadOnlyFieldset>
        <div className={CARD_CLASS}>
          <Choice
            name="board-read"
            legend="글 읽기"
            options={READ_OPTIONS}
            value={permissions.read}
            saved={saved.read}
            memberBlocked={readBlocked}
            onChange={(read) => onChange({ ...permissions, read })}
          />
          {readBlocked && (
            <p className="text-sm text-amber-700">
              {permissions.read === 'MEMBER'
                ? '방문자 회원 기능이 꺼져 있어 지금은 아무도 이 게시판의 글을 읽을 수 없습니다. 누구나로 바꾸거나 회원 기능을 켜 주세요.'
                : '방문자 회원 기능이 꺼져 있어 회원만 읽기를 고를 수 없습니다.'}
            </p>
          )}
          {permissions.read === 'MEMBER' && (
            <p className="text-sm text-slate-500">
              게시판은 상단 메뉴에 그대로 보이고, 로그인하지 않은 방문자에게는 로그인 안내가 나옵니다.
            </p>
          )}
        </div>

        <div className={`mt-5 ${CARD_CLASS}`}>
          <Choice
            name="board-write"
            legend="글쓰기"
            options={WRITE_OPTIONS}
            value={permissions.write}
            saved={saved.write}
            memberBlocked={writeBlocked}
            onChange={(write) => onChange({ ...permissions, write })}
          />
          {writeBlocked && (
            <p className="text-sm text-amber-700">
              {permissions.write === 'MEMBER' ? `지금은 회원이 글을 쓸 수 없습니다. ${writeBlocked}` : writeBlocked}
            </p>
          )}
          {permissions.write === 'MEMBER' && (
            <p className="text-sm text-slate-500">
              회원이 쓴 글은 글 관리에 회원 이름과 함께 보이고, 관리자가 비공개로 바꾸거나 지울 수 있습니다. 한 회원은
              1시간에 10개까지 씁니다.
            </p>
          )}
        </div>
      </ReadOnlyFieldset>
    </div>
  )
}
