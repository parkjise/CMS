import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { PublicSection } from '@/lib/publicSite.types'
import { pageHref } from '@/templates/shared/contracts'
import { hospitalASample } from '@/templates/hospital-a/sample-content'

const post = vi.fn()
vi.mock('@/lib/api', () => ({ publicApi: { post: (...args: unknown[]) => post(...args) } }))
vi.mock('@/lib/recaptcha', () => ({ executeRecaptcha: vi.fn().mockResolvedValue('token-1') }))
const fetchBoardList = vi.fn()
const fetchBoardPost = vi.fn()
vi.mock('@/lib/publicBoard', () => ({
  fetchBoardList: (...a: unknown[]) => fetchBoardList(...a),
  fetchBoardPost: (...a: unknown[]) => fetchBoardPost(...a),
}))

import { NoticeBoard, sortNotices } from '@/templates/hospital-a/components/board/NoticeBoard'
import { ConsultBoard } from '@/templates/hospital-a/components/board/ConsultBoard'
import { ConsultUnlock } from '@/templates/hospital-a/components/board/ConsultUnlock'
import { ConsultWrite } from '@/templates/hospital-a/components/board/ConsultWrite'
import { ReserveForm } from '@/templates/hospital-a/components/board/ReserveForm'
import { formatPhone } from '@/templates/hospital-a/components/board/formValidation'

const sampleSection = (page: string): PublicSection => {
  const s = hospitalASample.pages[page].find((x) => x.section_type === 'BOARD')!
  return {
    id: `sample:${page}`,
    section_type: 'BOARD',
    label: s.label,
    display_order: 1,
    is_active: true,
    settings: Object.entries(s.settings).map(([k, v]) => ({
      field_key: k,
      field_value: typeof v === 'string' ? v : JSON.stringify(v),
      value_type: typeof v === 'string' ? 'STRING' : 'JSON',
    })),
  }
}
const hrefFor = (page: string) => (extra?: { id?: string; q?: string; p?: number }) =>
  pageHref('demo', page, undefined, extra)
const target = { action: '/demo/notice', hidden: [] as [string, string][] }

beforeEach(() => {
  post.mockReset()
  fetchBoardList.mockReset()
  fetchBoardPost.mockReset()
})

describe('게시판 주소 (T-123)', () => {
  it('상세·검색·페이지를 실제 주소와 미리보기 주소로 만든다', () => {
    expect(pageHref('demo', 'notice', undefined, { id: 'n1' })).toBe('/demo/notice/n1')
    expect(pageHref('demo', 'notice', undefined, { q: '운영', p: 2 })).toBe('/demo/notice?q=%EC%9A%B4%EC%98%81&p=2')
    expect(pageHref('demo', 'notice', undefined, { p: 1 })).toBe('/demo/notice')
    expect(pageHref('demo', 'consult', 'tpl=TPL_X', { id: 'write' })).toBe(
      '/demo/preview?tpl=TPL_X&page=consult&id=write',
    )
  })

  it('연락처 형식 맞추기', () => {
    expect(formatPhone('01012345678')).toBe('010-1234-5678')
    expect(formatPhone('0212345678')).toBe('02-1234-5678')
  })
})

describe('공지사항 (T-123)', () => {
  it('고정 글 먼저, 나머지는 최신순', () => {
    const sorted = sortNotices([
      { id: 'a', subject: 'a', date: '2026-01-01' },
      { id: 'p', subject: 'p', date: '2025-01-01', pinned: true },
      { id: 'b', subject: 'b', date: '2026-05-01' },
    ])
    expect(sorted.map((i) => i.id)).toEqual(['p', 'b', 'a'])
  })

  it('목록: 총 건수 · 공지 배지 3개 · 상세 링크', () => {
    render(<NoticeBoard section={sampleSection('notice')} editable={false} tenantSlug="demo" page={1} hrefFor={hrefFor('notice')} searchTarget={target} />)
    expect(document.querySelector('.board-toolbar__count')).toHaveTextContent('10')
    expect(screen.getAllByText('공지')).toHaveLength(3)
    expect(screen.getByRole('link', { name: /홈페이지 리뉴얼 오픈 안내/ })).toHaveAttribute('href', '/demo/notice/n1')
  })

  it('검색: 제목에 검색어가 있는 글만, 없으면 안내', () => {
    const { rerender, container } = render(
      <NoticeBoard section={sampleSection('notice')} editable={false} tenantSlug="demo" page={1} q="운영" hrefFor={hrefFor('notice')} searchTarget={target} />,
    )
    const subjects = [...container.querySelectorAll('.board-list__subject')].map((e) => e.textContent)
    expect(subjects.length).toBeGreaterThan(0)
    expect(subjects.every((t) => t?.includes('운영'))).toBe(true)
    rerender(
      <NoticeBoard section={sampleSection('notice')} editable={false} tenantSlug="demo" page={1} q="없는말" hrefFor={hrefFor('notice')} searchTarget={target} />,
    )
    expect(screen.getByText('검색 결과가 없습니다.')).toBeInTheDocument()
  })

  it('상세: 본문 블록(이미지·문단·목록) + 다음 글 링크', () => {
    const { container } = render(
      <NoticeBoard section={sampleSection('notice')} editable={false} tenantSlug="demo" page={1} detailId="n1" hrefFor={hrefFor('notice')} searchTarget={target} />,
    )
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('홈페이지 리뉴얼 오픈 안내')
    expect(container.querySelector('.board-view__content img')).not.toBeNull()
    expect(container.querySelectorAll('.board-view__content li')).toHaveLength(3)
    expect(screen.getByRole('link', { name: '목록보기' })).toHaveAttribute('href', '/demo/notice')
    expect(screen.getByRole('link', { name: /이전 게시글/ })).toHaveAttribute('href', '/demo/notice/n2')
  })
})

describe('온라인 상담 (T-123)', () => {
  const base = { tenantSlug: 'demo', brandName: 'BAZZAR', page: 1, hrefFor: hrefFor('consult'), searchTarget: target }

  it('샘플 섹션은 샘플 글로 목록을 그린다 (API 호출 없음)', async () => {
    const { container } = render(await ConsultBoard({ ...base, section: sampleSection('consult'), editable: false }))
    expect(fetchBoardList).not.toHaveBeenCalled()
    expect(screen.getAllByRole('row')).toHaveLength(11) // 머리 + 10
    expect(container.querySelector('.board-toolbar__count')).toHaveTextContent('12')
    expect(screen.getAllByText('비밀글')).toHaveLength(10)
    expect(screen.getByRole('link', { name: '글쓰기' })).toHaveAttribute('href', '/demo/consult/write')
  })

  it('테넌트 섹션은 공개 API 로 목록을 읽는다', async () => {
    fetchBoardList.mockResolvedValue({
      total: 1,
      page: 1,
      size: 10,
      items: [{ id: 'p1', no: 1, subject: '주차 문의', author: '홍**', is_secret: false, answered: true, created_at: '2026-10-23T01:12:00Z' }],
    })
    render(await ConsultBoard({ ...base, section: { ...sampleSection('consult'), id: 'real' }, editable: true, q: '주차' }))
    expect(fetchBoardList).toHaveBeenCalledWith('demo', { page: 1, size: 10, q: '주차' })
    const row = screen.getAllByRole('row')[1]
    expect(within(row).getByText('답변완료')).toBeInTheDocument()
    // 한국 시간으로 표시 (UTC 01:12 → 10:12)
    expect(within(row).getByText('2026-10-23 10:12')).toBeInTheDocument()
  })

  it('잠긴 비밀글은 비밀번호 확인 화면을 보여준다', async () => {
    fetchBoardPost.mockResolvedValue({
      id: 'p1', subject: '비밀 질문', author: '홍**', is_secret: true, answered: false, created_at: '2026-10-23T01:12:00Z',
      locked: true, message: null, answer: null, answered_at: null, prev_id: null, next_id: 'p2',
    })
    render(await ConsultBoard({ ...base, section: { ...sampleSection('consult'), id: 'real' }, editable: true, detailId: 'p1' }))
    expect(screen.getByLabelText('비밀번호')).toBeInTheDocument()
    expect(screen.queryByText(/답변/)).not.toBeInTheDocument()
  })
})

describe('비밀글 열람 (T-123)', () => {
  const locked = {
    id: 'p1', subject: '비밀 질문', author: '홍**', is_secret: true, answered: true, created_at: '2026-10-23T01:12:00Z',
    locked: true, message: null, answer: null, answered_at: null, prev_id: null, next_id: null,
  }
  const props = { tenantSlug: 'demo', post: locked, brandName: 'BAZZAR', prevHref: null, nextHref: null, listHref: '/demo/consult' }

  it('비밀번호가 맞으면 내용과 답변을 보여준다', async () => {
    post.mockResolvedValue({ data: { data: { ...locked, locked: false, message: '내용입니다', answer: '답변입니다', answered_at: '2026-10-24T00:00:00Z' } } })
    render(<ConsultUnlock {...props} />)
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: '1234' } })
    fireEvent.click(screen.getByRole('button', { name: '확인' }))
    expect(await screen.findByText('답변입니다')).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith('/inquiries/board/p1/unlock', { password: '1234' }, { params: { tenant_slug: 'demo' } })
  })

  it('틀리면 안내 문구', async () => {
    post.mockRejectedValue(new Error('403'))
    render(<ConsultUnlock {...props} />)
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: '0000' } })
    fireEvent.click(screen.getByRole('button', { name: '확인' }))
    expect(await screen.findByText('비밀번호가 일치하지 않습니다.')).toBeInTheDocument()
  })
})

describe('상담 글쓰기 · 예약 폼 (T-123)', () => {
  it('글쓰기: 필수값 순서대로 안내, 다 채우면 비밀글로 등록 요청', async () => {
    post.mockResolvedValue({ data: { data: { post_id: 'new-1' } } })
    render(<ConsultWrite tenantSlug="demo" listHref="/demo/consult" detailHrefTemplate="/demo/consult/__ID__" />)
    const submit = screen.getByRole('button', { name: '등록' })
    fireEvent.click(submit)
    expect(screen.getByRole('status')).toHaveTextContent('이름을 입력해 주세요.')

    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '홍길동' } })
    fireEvent.change(screen.getByLabelText(/^비밀번호/), { target: { value: '12' } })
    fireEvent.click(submit)
    expect(screen.getByRole('status')).toHaveTextContent('비밀번호를 4자리 이상 입력해 주세요.')

    fireEvent.change(screen.getByLabelText(/^비밀번호/), { target: { value: '1234' } })
    fireEvent.input(screen.getByLabelText(/^연락처/), { target: { value: '010-1234-5678' } })
    fireEvent.change(screen.getByLabelText(/^제목/), { target: { value: '주차 문의' } })
    fireEvent.change(screen.getByLabelText(/^내용/), { target: { value: '주차가 가능한지 궁금합니다.' } })
    fireEvent.click(screen.getByLabelText(/이용약관/))
    fireEvent.click(submit)

    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(post).toHaveBeenCalledWith(
      '/inquiries/board',
      expect.objectContaining({ name: '홍길동', password: '1234', phone: '010-1234-5678', subject: '주차 문의', is_secret: true, recaptcha_token: 'token-1' }),
      { params: { tenant_slug: 'demo' } },
    )
    expect(await screen.findByText(/상담 글이 등록되었습니다/)).toBeInTheDocument()
  })

  it('예약: 날짜·시간·휴대폰 형식 검사 후 RESERVATION 으로 접수', async () => {
    post.mockResolvedValue({ data: { data: { inquiry_id: 'r1' } } })
    render(<ReserveForm tenantSlug="demo" times={['10:00', '14:00']} />)
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '홍길동' } })
    fireEvent.click(screen.getByRole('button', { name: '등록' }))
    expect(screen.getByRole('status')).toHaveTextContent('희망 날짜를 선택해 주세요.')

    fireEvent.change(screen.getByLabelText('희망 날짜'), { target: { value: '2026-11-05' } })
    fireEvent.change(screen.getByLabelText('희망 시간대'), { target: { value: '10:00' } })
    fireEvent.input(screen.getByLabelText(/^연락처/), { target: { value: '0212345678' } })
    fireEvent.change(screen.getByLabelText(/^제목/), { target: { value: '첫 방문' } })
    fireEvent.change(screen.getByLabelText(/^내용/), { target: { value: '오전 상담 받고 싶습니다.' } })
    fireEvent.click(screen.getByLabelText(/이용약관/))
    fireEvent.click(screen.getByRole('button', { name: '등록' }))
    expect(screen.getByRole('status')).toHaveTextContent('휴대폰 번호를 정확히 입력해 주세요.')

    fireEvent.input(screen.getByLabelText(/^연락처/), { target: { value: '01012345678' } })
    fireEvent.click(screen.getByRole('button', { name: '등록' }))
    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(post).toHaveBeenCalledWith(
      '/inquiries',
      expect.objectContaining({ inquiry_type: 'RESERVATION', reserved_date: '2026-11-05', reserved_time: '10:00', phone: '010-1234-5678' }),
      { params: { tenant_slug: 'demo' } },
    )
    expect(await screen.findByText(/예약 신청이 접수되었습니다/)).toBeInTheDocument()
  })
})
