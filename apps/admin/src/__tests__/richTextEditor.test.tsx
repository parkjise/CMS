import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RichNode } from '@cms/types'
import { RichTextEditor } from '@/components/boards/RichTextEditor'
import { fromEditorDoc, normalizeLink, toEditorDoc } from '@/lib/richBody'

vi.mock('@/hooks/useUploadImage', () => ({ uploadImage: vi.fn() }))

beforeAll(() => {
  // jsdom 에 없는 배치 API — ProseMirror 가 부른다
  const rect = { x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, toJSON: () => ({}) }
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as never
  Range.prototype.getBoundingClientRect = () => rect
  HTMLElement.prototype.scrollIntoView = vi.fn()
  document.elementFromPoint = () => null
})

const para = (text: string): RichNode => ({ type: 'paragraph', content: [{ type: 'text', text }] })

describe('본문 변환', () => {
  it('이전 형식을 편집기 문서로 — 굵게 · 줄바꿈 · 목록 · 사진', () => {
    expect(
      toEditorDoc([
        { type: 'p', text: '앞 **굵게** 뒤\n둘째' },
        { type: 'ul', items: ['하나'] },
        { type: 'image', src: '/a.webp', alt: '설명' },
      ]).content,
    ).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '앞 ' },
          { type: 'text', text: '굵게', marks: [{ type: 'bold' }] },
          { type: 'text', text: ' 뒤' },
          { type: 'hardBreak' },
          { type: 'text', text: '둘째' },
        ],
      },
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '하나' }] }] }],
      },
      { type: 'image', attrs: { src: '/a.webp', alt: '설명' } },
    ])
  })

  it('새 형식은 그대로', () => {
    const node = { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '제목' }] }
    expect(toEditorDoc([node]).content).toEqual([node])
  })

  it('앞뒤 빈 줄은 저장하지 않고, 글 사이 빈 줄은 둔다', () => {
    const empty = { type: 'paragraph' }
    expect(fromEditorDoc({ type: 'doc', content: [empty] })).toEqual([])
    expect(fromEditorDoc({ type: 'doc', content: [empty, para('글'), empty, para('끝'), empty] })).toEqual([
      para('글'),
      empty,
      para('끝'),
    ])
  })

  it.each([
    ['https://a.com', 'https://a.com'],
    ['a.com', 'https://a.com'],
    ['/about', '/about'],
    ['mailto:a@b.c', 'mailto:a@b.c'],
    ['javascript:alert(1)', null],
    ['data:text/html,x', null],
    ['', null],
    ['https://', null],
  ])('링크 주소 %s → %s', (input, expected) => {
    expect(normalizeLink(input)).toBe(expected)
  })
})

describe('편집기', () => {
  it('기존 글을 보여 주고, 처음 값을 새 형식으로 알린다', async () => {
    const onChange = vi.fn()
    render(<RichTextEditor initial={[{ type: 'p', text: '기존 내용' }]} editable onChange={onChange} />)
    expect(await screen.findByText('기존 내용')).toBeInTheDocument()
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const [first] = onChange.mock.lastCall?.[0] as RichNode[]
    expect(first.type).toBe('paragraph')
    expect(first.content).toEqual([{ type: 'text', text: '기존 내용' }])
  })

  it('서식 버튼이 있고 표를 넣으면 표 편집이 나온다', async () => {
    const onChange = vi.fn()
    render(<RichTextEditor initial={[para('글')]} editable onChange={onChange} />)
    for (const name of ['큰 제목', '굵게', '밑줄', '글머리 목록', '번호 목록', '인용', '링크', '사진', '표']) {
      expect(await screen.findByRole('button', { name })).toBeInTheDocument()
    }
    await userEvent.click(screen.getByRole('button', { name: '표' }))
    await waitFor(() => expect(screen.getByRole('group', { name: '표 편집' })).toBeInTheDocument())
    expect(onChange.mock.lastCall?.[0].some((n: RichNode) => n.type === 'table')).toBe(true)
  })

  it('읽기 전용이면 서식 버튼이 없고 고칠 수 없다', async () => {
    render(<RichTextEditor initial={[para('글')]} editable={false} onChange={vi.fn()} />)
    expect(await screen.findByText('글')).toBeInTheDocument()
    expect(screen.queryByRole('toolbar', { name: '글 서식' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '내용' })).toHaveAttribute('contenteditable', 'false')
  })
})
