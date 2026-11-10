import { describe, expect, it } from 'vitest'
import { categoryOptions, categoryTabRows } from '@/lib/categoryTabs'

/** 카테고리 2단계 탭 · 글쓰기 고르기 (T-179) */

const tree = [
  { id: 'c1', name: '진료' },
  { id: 'k1', name: '임플란트', parent_id: 'c1' },
  { id: 'c2', name: '행사' },
  { id: 'k2', name: '교정', parent_id: 'c1' },
  // 숨긴 상위의 하위는 서버가 빼지만, 남아 있어도 1단계로 본다
  { id: 'o', name: '고아', parent_id: 'hidden' },
]

describe('categoryTabRows', () => {
  it('1단계만 있으면 지금과 같다', () => {
    const flat = [
      { id: 'a', name: '가' },
      { id: 'b', name: '나' },
    ]
    expect(categoryTabRows(flat, 'b')).toEqual({
      top: [{ name: '전체' }, ...flat],
      topCurrent: 'b',
      sub: [],
    })
  })

  it('하위를 고르면 그 상위가 첫 줄에서 켜진다', () => {
    const rows = categoryTabRows(tree, 'k2')
    expect(rows.top.map((t) => t.name)).toEqual(['전체', '진료', '행사', '고아'])
    expect(rows.topCurrent).toBe('c1')
    expect(rows.sub).toEqual([
      { id: 'c1', name: '전체' },
      { id: 'k1', name: '임플란트' },
      { id: 'k2', name: '교정' },
    ])
  })

  it('없는 분류 · 전체는 하위 줄이 없다', () => {
    expect(categoryTabRows(tree, 'gone')).toMatchObject({ topCurrent: undefined, sub: [] })
    expect(categoryTabRows(tree)).toMatchObject({ topCurrent: undefined, sub: [] })
  })
})

describe('categoryOptions', () => {
  it('상위 뒤에 하위를 `상위 › 하위` 로', () => {
    expect(categoryOptions(tree).map((o) => o.name)).toEqual([
      '진료',
      '진료 › 임플란트',
      '진료 › 교정',
      '행사',
      '고아',
    ])
  })
})
