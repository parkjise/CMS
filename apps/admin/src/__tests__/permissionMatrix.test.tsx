import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { PermissionMatrix } from '@/components/boards/PermissionMatrix'

/** 역할 행의 칸 — 배지면 "가능"/"불가", 알약이면 글자 */
const row = (role: string) =>
  within(screen.getByRole('row', { name: new RegExp(`^${role}`) }))
    .getAllByRole('cell')
    .map((cell) => within(cell).queryByRole('img')?.getAttribute('aria-label') ?? cell.textContent)

describe('권한 표 — 역할 × 동작 (T-213)', () => {
  it('기본값: 누구나 읽기 · 관리자 글쓰기', () => {
    render(<PermissionMatrix permissions={{ read: 'PUBLIC', write: 'ADMIN' }} allowGuest={false} />)
    expect(row('관리자')).toEqual(['가능', '가능', '가능', '가능'])
    expect(row('회원')).toEqual(['가능', '불가', '불가', '불가'])
    expect(row('비회원')).toEqual(['가능', '불가', '불가', '불가'])
  })

  it('회원 글쓰기면 회원은 본인 글만 고치고 지운다', () => {
    render(<PermissionMatrix permissions={{ read: 'PUBLIC', write: 'MEMBER' }} allowGuest={false} />)
    expect(row('회원')).toEqual(['가능', '가능', '본인 글', '본인 글'])
  })

  it('회원만 읽기면 비회원은 읽을 수 없고, 비회원 글쓰기는 글 비밀번호로', () => {
    render(<PermissionMatrix permissions={{ read: 'MEMBER', write: 'ADMIN' }} allowGuest />)
    expect(row('비회원')).toEqual(['불가', '가능', '글 비밀번호', '글 비밀번호'])
  })

  it('표 이름 · 열 제목', () => {
    render(<PermissionMatrix permissions={{ read: 'PUBLIC', write: 'ADMIN' }} allowGuest={false} />)
    const table = screen.getByRole('table', { name: '역할별 권한 요약' })
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      '역할',
      '읽기',
      '쓰기',
      '수정',
      '삭제',
    ])
  })
})
