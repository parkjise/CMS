import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  POST_TABLE_STORAGE_KEY,
  orderTableFields,
  parseTableLayouts,
  postTableScope,
  readTableLayouts,
  tableColumnSize,
  toTableLayout,
  usePostTableLayoutStore,
} from '@/stores/postTableLayoutStore'

const a = postTableScope('tenant-a', 'user-a', 'board-a')!
const b = postTableScope('tenant-a', 'user-b', 'board-a')!
const layout = { order: ['f2', 'f1'], sizes: { f1: 'wide' as const } }
beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.removeItem(POST_TABLE_STORAGE_KEY)
  usePostTableLayoutStore.setState({ layouts: {}, saveFailed: {} })
})

describe('관리자 표 개인 설정 저장', () => {
  it('계정/사업체/게시판을 모두 구분하고 불완전한 계정은 저장 범위가 없다', () => {
    expect(a).not.toBe(b)
    expect(a).not.toBe(postTableScope('tenant-b', 'user-a', 'board-a'))
    expect(a).not.toBe(postTableScope('tenant-a', 'user-a', 'board-b'))
    expect(postTableScope(undefined, 'user-a', 'board-a')).toBeNull()
    expect(postTableScope('tenant-a', '', 'board-a')).toBeNull()
  })
  it.each([null, 'broken', '[]', '{"version":2,"layouts":{}}', '{"version":1,"layouts":null}'])(
    '잘못된 저장 형식을 안전하게 기본값으로 바꾼다: %s',
    (raw) => {
      expect(parseTableLayouts(raw)).toEqual({})
    }
  )
  it('중복 ID/잘못된 크기/알 수 없는 속성은 버리고 유효한 메타데이터만 읽는다', () => {
    const raw = JSON.stringify({
      version: 1,
      layouts: {
        [a]: {
          order: ['f1', 'f1', 0, 'f2'],
          sizes: { f1: 'wide', f2: '999px', f3: 'narrow' },
          values: { f1: '저장하면 안 되는 값' },
        },
        bad: { order: ['x'] },
      },
    })
    expect(parseTableLayouts(raw)).toEqual({
      [a]: { order: ['f1', 'f2'], sizes: { f1: 'wide', f3: 'narrow' } },
    })
  })
  it('삭제/숨긴 열은 제외하고 새 열은 필드 순서대로 끝에 추가하며 원본은 바꾸지 않는다', () => {
    const fields = [{ id: 'new1' }, { id: 'f1' }, { id: 'new2' }, { id: 'f2' }]
    expect(
      orderTableFields(fields, { order: ['removed', 'f2', 'f2', 'f1'], sizes: {} }).map((f) => f.id)
    ).toEqual(['f2', 'f1', 'new1', 'new2'])
    expect(fields.map((f) => f.id)).toEqual(['new1', 'f1', 'new2', 'f2'])
    expect(tableColumnSize(undefined, 'new1')).toBe('normal')
  })
  it('순서/크기만 저장하고 다시 읽을 수 있으며 초기화는 현재 범위만 지운다', () => {
    const save = usePostTableLayoutStore.getState().save
    save(a, layout)
    save(b, { order: ['f3'], sizes: {} })
    expect(readTableLayouts()).toEqual({ [a]: layout, [b]: { order: ['f3'], sizes: {} } })
    expect(JSON.parse(localStorage.getItem(POST_TABLE_STORAGE_KEY)!).layouts[a]).toEqual(layout)
    save(a, null)
    expect(readTableLayouts()).toEqual({ [b]: { order: ['f3'], sizes: {} } })
  })
  it('저장 불가에도 화면 설정은 유지하고 재시도 성공 뒤 실패 표시를 지운다', () => {
    const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    usePostTableLayoutStore.getState().save(a, layout)
    expect(usePostTableLayoutStore.getState().layouts[a]).toEqual(layout)
    expect(usePostTableLayoutStore.getState().saveFailed[a]).toBe(true)
    spy.mockRestore()
    usePostTableLayoutStore.getState().save(a, layout)
    expect(usePostTableLayoutStore.getState().saveFailed).toEqual({})
    expect(readTableLayouts()[a]).toEqual(layout)
  })
  it('읽기 불가에도 화면을 중단하지 않는다', () => {
    const spy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readTableLayouts()).toEqual({})
    expect(spy).toHaveBeenCalledWith(POST_TABLE_STORAGE_KEY)
  })
  it('최근 100개 범위만 유지해 저장 공간 증가를 제한한다', () => {
    const save = usePostTableLayoutStore.getState().save
    for (let i = 0; i < 105; i++) save(postTableScope('t', 'u', `b${i}`)!, layout)
    expect(Object.keys(readTableLayouts())).toHaveLength(100)
    expect(readTableLayouts()[postTableScope('t', 'u', 'b0')!]).toBeUndefined()
    expect(readTableLayouts()[postTableScope('t', 'u', 'b104')!]).toEqual(layout)
  })
})

describe('toTableLayout (T-181)', () => {
  it('서버 응답에서도 열 ID 순서 · 크기만 꺼내고 형식이 아니면 null', () => {
    expect(
      toTableLayout({ order: ['a', 'a', 'b', 3], sizes: { a: 'wide', b: 'huge' }, updated_at: 'x' })
    ).toEqual({ order: ['a', 'b'], sizes: { a: 'wide' } })
    expect(toTableLayout(null)).toBeNull()
    expect(toTableLayout([])).toBeNull()
  })
})
