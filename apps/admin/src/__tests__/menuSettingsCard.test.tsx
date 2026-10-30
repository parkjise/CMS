import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithQuery } from './renderWithQuery'
import { MenuSettingsCard } from '@/components/content/MenuSettingsCard'
import { api } from '@/lib/api'

// 공통 설정 → 상단 메뉴 (T-036-B)

const ok = (data: unknown) => ({ data: { success: true, data } })

const menu = (mode: 'theme' | 'code') => ({
  mode,
  reorderable: mode === 'code',
  items: [
    { key: 'about', default_label: '회사소개', label: null, visible: true },
    { key: 'business', default_label: '사업영역', label: null, visible: true },
    { key: 'notice', default_label: '공지사항', label: null, visible: true },
  ],
})

beforeEach(() => vi.restoreAllMocks())

describe('MenuSettingsCard', () => {
  it('코드형: 이름 바꾸기 · 숨기기 · 순서 바꾸기를 저장한다', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(ok(menu('code')))
    const put = vi.spyOn(api, 'put').mockResolvedValue(ok(menu('code')))
    const user = userEvent.setup()
    renderWithQuery(<MenuSettingsCard />)

    await user.type(await screen.findByLabelText('사업영역 메뉴 이름'), '진료과목')
    await user.click(screen.getByLabelText('공지사항 메뉴 보이기'))
    await user.click(screen.getByRole('button', { name: '사업영역 위로' }))
    await user.click(screen.getByRole('button', { name: '메뉴 저장' }))

    await waitFor(() => expect(put).toHaveBeenCalled())
    expect(put.mock.calls[0]).toEqual([
      '/v1/site-settings/menu',
      {
        items: [
          { key: 'business', label: '진료과목', visible: true },
          { key: 'about', label: null, visible: true },
          { key: 'notice', label: null, visible: false },
        ],
      },
    ])
  })

  it('테마형: 순서 버튼 없이 섹션 순서 안내', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(ok(menu('theme')))
    renderWithQuery(<MenuSettingsCard />)
    expect(await screen.findByText(/메뉴 순서는 섹션 순서를 따라요/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '회사소개 위로' })).not.toBeInTheDocument()
  })

  it('[기본값으로] 는 빈 목록을 보낸다', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(ok(menu('code')))
    const put = vi.spyOn(api, 'put').mockResolvedValue(ok(menu('code')))
    const user = userEvent.setup()
    renderWithQuery(<MenuSettingsCard />)
    await user.click(await screen.findByRole('button', { name: '기본값으로' }))
    await waitFor(() => expect(put).toHaveBeenCalledWith('/v1/site-settings/menu', { items: [] }))
  })

  it('메뉴가 없으면 안내', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(ok({ mode: 'theme', reorderable: false, items: [] }))
    renderWithQuery(<MenuSettingsCard />)
    expect(await screen.findByText('메뉴로 보일 섹션이 아직 없어요.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '메뉴 저장' })).toBeDisabled()
  })
})
