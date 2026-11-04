import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DomainInfo } from '@/hooks/useDomain'

const useDomainStatus = vi.fn()
const useDomainLimits = vi.fn()
const registerMutate = vi.fn()
const verifyMutate = vi.fn()
const removeMutate = vi.fn()
vi.mock('@/hooks/useDomain', () => ({
  useDomainStatus: () => useDomainStatus(),
  useDomainLimits: () => useDomainLimits(),
  useRegisterDomain: () => ({ mutateAsync: registerMutate, isPending: false }),
  useVerifyDomain: () => ({ mutate: verifyMutate, isPending: false }),
  useRemoveDomain: () => ({ mutate: removeMutate, isPending: false }),
}))

import { DomainTab } from '@/components/billing/tabs/DomainTab'

const dom = (over: Partial<DomainInfo>): DomainInfo => ({
  id: 'd1',
  tenant_id: 't1',
  domain: 'www.mysite.com',
  domain_type: 'CUSTOM',
  status: 'PENDING',
  ssl_expires_at: null,
  verified_at: null,
  created_at: '2026-07-05T00:00:00Z',
  cname_target: 'cms.example.com',
  failure_code: null,
  ...over,
})

describe('DomainTab (AD-08)', () => {
  beforeEach(() => {
    useDomainStatus.mockReset()
    useDomainLimits.mockReset().mockReturnValue({
      data: { custom_domain_allowed: true, cname_target: 'cms.example.com' },
    })
    registerMutate.mockReset().mockResolvedValue({})
    verifyMutate.mockReset()
  })

  it('도메인 없으면 등록 폼 표시 + 등록 호출', async () => {
    const user = userEvent.setup()
    useDomainStatus.mockReturnValue({ data: null, isLoading: false })
    render(<DomainTab />)
    const input = screen.getByPlaceholderText('www.mysite.com')
    await user.type(input, 'www.newsite.com')
    await user.click(screen.getByRole('button', { name: '등록' }))
    expect(registerMutate).toHaveBeenCalledWith('www.newsite.com')
  })

  it('PENDING 상태는 단계 표시 + CNAME 가이드 + DNS 확인 버튼', () => {
    useDomainStatus.mockReturnValue({ data: dom({ status: 'PENDING' }), isLoading: false })
    render(<DomainTab />)
    expect(screen.getByText('www.mysite.com')).toBeInTheDocument()
    expect(screen.getByText('cms.example.com')).toBeInTheDocument()
    expect(screen.getByText('DNS 전파 확인')).toBeInTheDocument()
    expect(screen.getByText('연결 완료')).toBeInTheDocument()
  })

  it('ACTIVE 상태는 DNS 확인 버튼 없음', () => {
    useDomainStatus.mockReturnValue({ data: dom({ status: 'ACTIVE' }), isLoading: false })
    render(<DomainTab />)
    expect(screen.queryByText('DNS 전파 확인')).not.toBeInTheDocument()
    expect(screen.getByText('연결 해제')).toBeInTheDocument()
  })


  it('낮은 요금제 — 입력을 잠그고 요금제 안내', () => {
    useDomainStatus.mockReturnValue({ data: null, isLoading: false })
    useDomainLimits.mockReturnValue({ data: { custom_domain_allowed: false, cname_target: 'x' } })
    render(<DomainTab />)
    expect(screen.getByText(/STANDARD 이상/)).toBeInTheDocument()
    expect(screen.getByLabelText('연결할 도메인')).toBeDisabled()
    expect(screen.getByRole('button', { name: '등록' })).toBeDisabled()
  })

  it('www 주소 — 이름 www, 값은 연결 대상', () => {
    useDomainStatus.mockReturnValue({ data: dom({}), isLoading: false })
    render(<DomainTab />)
    expect(screen.getByText('CNAME')).toBeInTheDocument()
    expect(screen.getByText('www')).toBeInTheDocument()
    expect(screen.getByText('cms.example.com')).toBeInTheDocument()
  })

  it('루트 도메인 — CNAME 제약을 안내', () => {
    useDomainStatus.mockReturnValue({ data: dom({ domain: 'mysite.com' }), isLoading: false })
    render(<DomainTab />)
    expect(screen.getByText(/CNAME 을 넣을 수 없습니다/)).toBeInTheDocument()
  })

  it('DNS 실패 — 사유 · 설정값 · 다시 확인', () => {
    useDomainStatus.mockReturnValue({
      data: dom({ status: 'FAILED', failure_code: 'DNS' }),
      isLoading: false,
    })
    render(<DomainTab />)
    expect(screen.getByRole('alert')).toHaveTextContent('우리 서버를 가리키지 않습니다')
    expect(screen.getByText('cms.example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 확인' })).toBeInTheDocument()
  })

  it('인증서 실패 — DNS 안내 없이 사유만', () => {
    useDomainStatus.mockReturnValue({
      data: dom({ status: 'FAILED', failure_code: 'SSL' }),
      isLoading: false,
    })
    render(<DomainTab />)
    expect(screen.getByRole('alert')).toHaveTextContent('보안 인증서')
    expect(screen.queryByText('CNAME')).toBeNull()
  })

  it('발급 중 — 확인 버튼 없음', () => {
    useDomainStatus.mockReturnValue({ data: dom({ status: 'SSL_ISSUING' }), isLoading: false })
    render(<DomainTab />)
    expect(screen.getByText(/1분 안에/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /확인/ })).toBeNull()
  })

  it('연결 완료 — 주소 링크 · 만료일', () => {
    useDomainStatus.mockReturnValue({
      data: dom({ status: 'ACTIVE', ssl_expires_at: '2027-02-01T00:00:00Z' }),
      isLoading: false,
    })
    render(<DomainTab />)
    expect(screen.getByRole('link', { name: /www.mysite.com/ })).toHaveAttribute(
      'href',
      'https://www.mysite.com',
    )
    expect(screen.getByText(/자동으로 갱신/)).toBeInTheDocument()
  })

  it('연결 해제는 확인 후에만', async () => {
    const user = userEvent.setup()
    useDomainStatus.mockReturnValue({ data: dom({ status: 'ACTIVE' }), isLoading: false })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<DomainTab />)
    await user.click(screen.getByRole('button', { name: '연결 해제' }))
    expect(removeMutate).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: '연결 해제' }))
    expect(removeMutate).toHaveBeenCalled()
    confirm.mockRestore()
  })
})
