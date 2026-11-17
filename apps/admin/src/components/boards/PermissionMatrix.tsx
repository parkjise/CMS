import { Check, Minus } from 'lucide-react'
import type { BoardPermissions } from '@cms/types'

type Cell = true | false | string

interface PermissionMatrixProps {
  /** 지금 고른(저장 전 포함) 읽기 · 쓰기 */
  permissions: BoardPermissions
  /** 비회원 글쓰기 — 운영 설정 */
  allowGuest: boolean
}

const ACTIONS = ['읽기', '쓰기', '수정', '삭제'] as const

/**
 * 역할 × 동작 요약 표 (T-213, 1113 #12 · 와이어프레임 v2 permissionsPage).
 * 저장 값이 아니라 지금 설정에서 계산한다 — 고르면 바로 바뀐다.
 */
export function PermissionMatrix({ permissions, allowGuest }: PermissionMatrixProps) {
  const memberWrites = permissions.write === 'MEMBER'
  const rows: [string, Cell[]][] = [
    ['관리자', [true, true, true, true]],
    ['회원', [true, memberWrites, memberWrites && '본인 글', memberWrites && '본인 글']],
    [
      '비회원',
      [
        permissions.read === 'PUBLIC',
        allowGuest,
        allowGuest && '글 비밀번호',
        allowGuest && '글 비밀번호',
      ],
    ],
  ]

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[480px] text-sm" aria-label="역할별 권한 요약">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
          <tr>
            <th scope="col" className="px-5 py-3 text-left font-medium">
              역할
            </th>
            {ACTIONS.map((action) => (
              <th key={action} scope="col" className="px-4 py-3 text-center font-medium">
                {action}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(([role, cells]) => (
            <tr key={role}>
              <th scope="row" className="px-5 py-3 text-left font-medium text-slate-800">
                {role}
              </th>
              {cells.map((cell, i) => (
                <td key={ACTIONS[i]} className="px-4 py-3 text-center">
                  <PermissionCell value={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** 가능 = 초록 원형 체크 배지, 불가 = 회색 —, 조건부 = 작은 알약 (색만으로 구분하지 않게 이름) */
function PermissionCell({ value }: { value: Cell }) {
  if (typeof value === 'string') {
    return (
      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
        {value}
      </span>
    )
  }
  if (value) {
    return (
      <span
        role="img"
        aria-label="가능"
        className="inline-grid h-6 w-6 place-items-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200"
      >
        <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
      </span>
    )
  }
  return (
    <span
      role="img"
      aria-label="불가"
      className="inline-grid h-6 w-6 place-items-center text-slate-300"
    >
      <Minus className="h-4 w-4" aria-hidden />
    </span>
  )
}
