import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { User } from '@cms/types'
import { canEditSite, useClientAuthStore } from '@/lib/authStore'
import { EDIT_MODE_SESSION_KEY, useEditStore } from '@/lib/editStore'
import { AuthInitializer } from '@/components/auth/AuthInitializer'
import { FloatingButtons } from '@/components/layout/FloatingButtons'
import { RestoreDraftDialog } from '@/components/layout/RestoreDraftDialog'
import { ThemeWriteLink } from '@/components/board/ThemeWriteLink'
import { NoticeWriteLink } from '@/templates/hospital-a/components/board/NoticeWriteLink'
import TenantLoginPage from '@/app/[tenant_slug]/login/page'

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))

const SITE = 'tenant-a'
const userOf = (tenant_id: string | null, role = 'TENANT_ADMIN') => ({ id: 'u', tenant_id, role }) as User

const signIn = (user: User, siteTenantId: string | null = SITE) =>
  useClientAuthStore.setState({ user, isLoggedIn: true, isInitialized: true, siteTenantId, flags: null })

beforeEach(() => {
  replace.mockReset()
  sessionStorage.clear()
  useClientAuthStore.setState({ user: null, isLoggedIn: false, isInitialized: false, siteTenantId: null, flags: null })
  useEditStore.setState({ isEditMode: false, pendingChanges: {}, isDirty: false, isPreview: false })
})

describe('다른 사업체 계정으로 홈페이지 보기 (T-144)', () => {
  it('편집 권한 — 자기 사업체 · 운영사 · 사업체를 모를 때만', () => {
    const state = (user: User, siteTenantId: string | null = SITE) => ({ isLoggedIn: true, user, siteTenantId })
    expect(canEditSite(state(userOf(SITE)))).toBe(true)
    expect(canEditSite(state(userOf('tenant-b')))).toBe(false)
    expect(canEditSite(state(userOf(null, 'SUPER_ADMIN')))).toBe(true)
    expect(canEditSite(state(userOf('tenant-b'), null))).toBe(true)
    expect(canEditSite(state(userOf(SITE, 'TENANT_VIEWER')))).toBe(false)
  })

  it('AuthInitializer 가 이 홈페이지의 사업체를 알려 준다', async () => {
    const initialize = vi.fn().mockResolvedValue(undefined)
    const realInitialize = useClientAuthStore.getState().initialize
    useClientAuthStore.setState({ initialize })
    render(<AuthInitializer tenantId={SITE} />)
    expect(useClientAuthStore.getState().siteTenantId).toBe(SITE)
    expect(initialize).toHaveBeenCalledOnce()
    useClientAuthStore.setState({ initialize: realInitialize })
  })

  it('다른 사업체 계정에는 글쓰기 · 수정 · 편집 모드 버튼이 없다', () => {
    signIn(userOf('tenant-b'))
    render(
      <>
        <ThemeWriteLink board="news" />
        <NoticeWriteLink board="notice" post="p1" />
        <FloatingButtons tenantSlug="a" kakaoUrl={null} />
      </>,
    )
    expect(screen.queryByRole('link', { name: '글쓰기' })).toBeNull()
    expect(screen.queryByRole('link', { name: '수정' })).toBeNull()
    expect(screen.queryByRole('button', { name: '편집 모드' })).toBeNull()
  })

  it('자기 사업체 계정에는 그대로 보인다', () => {
    signIn(userOf(SITE))
    render(
      <>
        <ThemeWriteLink board="news" />
        <NoticeWriteLink board="notice" post="p1" />
        <FloatingButtons tenantSlug="a" kakaoUrl={null} />
      </>,
    )
    expect(screen.getByRole('link', { name: '글쓰기' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '수정' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '편집 모드' })).toBeInTheDocument()
  })

  it('편집 모드로 들어가지 못하고, 다른 탭 기억도 지운다', () => {
    signIn(userOf('tenant-b'))
    useEditStore.getState().enterEditMode()
    expect(useEditStore.getState().isEditMode).toBe(false)
    sessionStorage.setItem(EDIT_MODE_SESSION_KEY, '1')
    useEditStore.getState().restoreEditMode()
    expect(useEditStore.getState().isEditMode).toBe(false)
    expect(sessionStorage.getItem(EDIT_MODE_SESSION_KEY)).toBeNull()
  })

  it('초안 복구를 묻지 않고, 그 초안을 지우지도 않는다', async () => {
    const draft = {
      'sec:title': { section_id: 'sec', field: 'title', original_value: 'a', new_value: 'b', changed_at: '' },
    }
    useEditStore.setState({ pendingChanges: draft, isDirty: true })
    signIn(userOf('tenant-b'))
    render(<RestoreDraftDialog />)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(useEditStore.getState().pendingChanges).toEqual(draft)
  })

  // 이미 끝난 Promise 로 넘겨 use() 가 멈추지 않게 한다 — render 안에서 이동 판단까지 끝난다
  const renderLogin = () => {
    const value = { tenant_slug: 'a' }
    const params = Object.assign(Promise.resolve(value), { status: 'fulfilled', value })
    render(<TenantLoginPage params={params} />)
  }

  it('로그인 화면 — 다른 사업체 계정은 그대로 두어 다시 로그인할 수 있다', () => {
    signIn(userOf('tenant-b'))
    renderLogin()
    expect(screen.getByRole('heading', { name: '관리자 로그인' })).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it('로그인 화면 — 자기 사업체 계정은 홈으로', () => {
    signIn(userOf(SITE))
    renderLogin()
    expect(replace).toHaveBeenCalledWith('/a')
  })
})
