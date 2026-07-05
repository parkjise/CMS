import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DomainInfo } from '@/hooks/useDomain'

const useDomainStatus = vi.fn()
const registerMutate = vi.fn()
const verifyMutate = vi.fn()
const removeMutate = vi.fn()
vi.mock('@/hooks/useDomain', () => ({
  useDomainStatus: () => useDomainStatus(),
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
  ...over,
})

describe('DomainTab (AD-08)', () => {
  beforeEach(() => {
    useDomainStatus.mockReset()
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

  it('FAILED 상태는 실패 안내', () => {
    useDomainStatus.mockReturnValue({ data: dom({ status: 'FAILED' }), isLoading: false })
    render(<DomainTab />)
    expect(screen.getByText(/연결에 실패했습니다/)).toBeInTheDocument()
  })
})
