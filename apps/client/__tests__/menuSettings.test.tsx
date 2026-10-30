import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { Navbar } from '@/components/layout/Navbar'
import { applyMenu } from '@/lib/menuSettings'
import type { PublicSection } from '@/lib/publicSite.types'
import { hospitalAManifest } from '@/templates/hospital-a/manifest'

// 상단 메뉴 설정 (T-036-B)

const items = [
  { key: 'a', label: '소개' },
  { key: 'b', label: '서비스' },
  { key: 'c', label: '문의' },
]

describe('applyMenu', () => {
  it('저장값이 없으면 기본 메뉴 그대로', () => {
    expect(applyMenu(items, null, true)).toEqual(items)
    expect(applyMenu(items, [], false)).toEqual(items)
  })

  it('이름 바꾸기 · 숨기기, 빈 이름은 기본 이름', () => {
    const out = applyMenu(
      items,
      [
        { key: 'a', label: '  병원 소개 ', visible: true },
        { key: 'b', label: null, visible: false },
        { key: 'c', label: '   ', visible: true },
      ],
      false,
    )
    expect(out.map((i) => i.label)).toEqual(['병원 소개', '문의'])
  })

  it('reorderable 이면 저장 순서대로, 저장값에 없는 새 메뉴는 기본 순서로 뒤에', () => {
    const out = applyMenu(
      [...items, { key: 'd', label: '새 메뉴' }],
      [
        { key: 'c', label: null, visible: true },
        { key: 'a', label: null, visible: true },
      ],
      true,
    )
    expect(out.map((i) => i.key)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('reorderable 이 아니면 저장 순서를 무시한다 (테마형 — 섹션 순서)', () => {
    const out = applyMenu(items, [{ key: 'c', label: null, visible: true }], false)
    expect(out.map((i) => i.key)).toEqual(['a', 'b', 'c'])
  })
})

const section = (id: string, label: string): PublicSection => ({
  id,
  section_type: 'INTRO',
  label,
  display_order: 0,
  is_active: true,
  settings: [],
})

describe('테마형 상단 메뉴', () => {
  it('바꾼 이름 · 숨긴 메뉴가 PC · 휴대폰 메뉴에 반영된다', () => {
    render(
      <Navbar
        tenantName="OO의원"
        sections={[section('s1', '소개'), section('s2', '갤러리'), section('s3', '문의')]}
        menuItems={[
          { key: 's1', label: '병원 소개', visible: true },
          { key: 's2', label: null, visible: false },
        ]}
      />,
    )
    const desktop = screen.getByRole('navigation', { name: '페이지 내 섹션' })
    expect(within(desktop).getAllByRole('button').map((b) => b.textContent)).toEqual(['병원 소개', '문의'])
    fireEvent.click(screen.getByRole('button', { name: '메뉴 열기' }))
    expect(screen.getAllByRole('button', { name: '병원 소개' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: '갤러리' })).not.toBeInTheDocument()
  })
})

describe('코드형 메뉴 기본값 동기화', () => {
  it('백엔드 메뉴 파일(TPL_HOSPITAL_A.menu.json)이 매니페스트 gnb 페이지와 같다', () => {
    const file = join(__dirname, '../../backend/app/data/templates/TPL_HOSPITAL_A.menu.json')
    const backend = JSON.parse(readFileSync(file, 'utf8')) as { key: string; title: string }[]
    const gnb = hospitalAManifest.pages
      .filter((p) => p.menu === 'gnb')
      .map((p) => ({ key: p.key, title: p.title }))
    expect(backend).toEqual(gnb)
  })
})
