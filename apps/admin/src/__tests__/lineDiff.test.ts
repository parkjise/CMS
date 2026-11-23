import { describe, expect, it } from 'vitest'
import { collapseSame, lineDiff } from '@/lib/lineDiff'

describe('줄 단위 비교 (T-230)', () => {
  it('같으면 모두 같은 줄', () => {
    expect(lineDiff('a\nb', 'a\nb')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'same', text: 'b' },
    ])
  })

  it('가운데를 바꾸면 뺀 줄 · 더한 줄, 앞뒤는 그대로', () => {
    expect(lineDiff('제1조\n옛 문장\n제3조', '제1조\n새 문장\n제3조')).toEqual([
      { kind: 'same', text: '제1조' },
      { kind: 'removed', text: '옛 문장' },
      { kind: 'added', text: '새 문장' },
      { kind: 'same', text: '제3조' },
    ])
  })

  it('줄을 끼워 넣거나 지우면 그 줄만', () => {
    expect(lineDiff('a\nc', 'a\nb\nc')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'added', text: 'b' },
      { kind: 'same', text: 'c' },
    ])
    expect(lineDiff('a\nb\nc\nd', 'a\nc')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'removed', text: 'b' },
      { kind: 'same', text: 'c' },
      { kind: 'removed', text: 'd' },
    ])
  })

  it('바뀐 곳에서 먼 같은 줄은 접는다', () => {
    const before = ['1', '2', '3', '4', '5', '6', '7', '8'].join('\n')
    const after = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].join('\n')
    expect(collapseSame(lineDiff(before, after))).toEqual([
      { kind: 'skipped', count: 6 },
      { kind: 'same', text: '7' },
      { kind: 'same', text: '8' },
      { kind: 'added', text: '9' },
    ])
  })
})
