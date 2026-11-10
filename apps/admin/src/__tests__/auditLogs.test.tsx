import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AuditLogEntry } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import { ADMIN_NAVIGATION, breadcrumbsFor } from '@/components/layout/navigation'
import { actionLabel, auditTarget } from '@/lib/auditLabels'
import { AuditLogsPage } from '@/pages/AuditLogsPage'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('@/lib/api', () => ({ api: { get } }))

const entry = (over: Partial<AuditLogEntry> = {}): AuditLogEntry => ({
  id: 'a1',
  action: 'POST_BULK_PUBLISH',
  target_type: 'board_post',
  actor: 'admin@clinic.com',
  board_name: null,
  target_name: null,
  count: 3,
  created_at: '2026-11-11T01:30:00Z',
  ...over,
})

const list = (items: AuditLogEntry[], total = items.length) =>
  Promise.resolve({ data: { data: { items, total, page: 1, limit: 20 } } })

describe('변경 기록 (T-186)', () => {
  it('한 일 · 대상 · 한 사람을 표로 보여 준다', async () => {
    get.mockReturnValue(
      list([
        entry(),
        entry({
          id: 'a2',
          action: 'BOARD_UPDATED',
          target_type: 'board',
          board_name: '공지사항',
          count: null,
          actor: '운영사',
        }),
      ]),
    )
    renderWithQuery(<AuditLogsPage />)

    expect(await screen.findByText('글 일괄 공개')).toBeInTheDocument()
    expect(screen.getByText('3개')).toBeInTheDocument()
    expect(screen.getByText('admin@clinic.com')).toBeInTheDocument()
    expect(screen.getByText('게시판 설정 변경')).toBeInTheDocument()
    expect(screen.getByText('공지사항')).toBeInTheDocument()
    expect(screen.getByText('운영사')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('/v1/audit-logs', { params: { page: 1, limit: 20 } })
  })

  it('종류를 고르면 첫 페이지부터 그 종류만 다시 불러온다', async () => {
    get.mockReturnValue(list([entry()], 45))
    renderWithQuery(<AuditLogsPage />)
    await screen.findByText('1 / 3')

    await userEvent.click(screen.getByRole('button', { name: '다음' }))
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/v1/audit-logs', { params: { page: 2, limit: 20 } }),
    )

    await userEvent.click(screen.getByRole('button', { name: '칸 · 카테고리' }))
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/v1/audit-logs', {
        params: { page: 1, limit: 20, kind: 'setup' },
      }),
    )
    expect(screen.getByRole('button', { name: '칸 · 카테고리' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('기록이 없으면 안내한다', async () => {
    get.mockReturnValue(list([]))
    renderWithQuery(<AuditLogsPage />)
    expect(await screen.findByText('아직 기록이 없어요.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다음' })).not.toBeInTheDocument()
  })

  it('불러오지 못하면 알린다', async () => {
    get.mockImplementation(() => Promise.reject(new Error('network')))
    renderWithQuery(<AuditLogsPage />)
    await waitFor(() => expect(screen.getByText('기록을 불러오지 못했습니다.')).toBeInTheDocument())
  })

  it('라벨 · 대상 글자 · 메뉴', () => {
    expect(actionLabel('POST_MOVED')).toBe('다른 게시판으로 글 옮기기')
    expect(actionLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW')
    expect(auditTarget(entry({ board_name: '후기', target_name: '첫 글', count: null }))).toBe('후기 · 첫 글')
    expect(auditTarget(entry({ count: null }))).toBe('-')
    const boards = ADMIN_NAVIGATION.find((item) => item.to === '/admin/boards')
    expect(boards?.children?.map((child) => child.label)).toContain('변경 기록')
    expect(breadcrumbsFor('/admin/boards/history').at(-1)).toEqual({ label: '변경 기록' })
  })
})
