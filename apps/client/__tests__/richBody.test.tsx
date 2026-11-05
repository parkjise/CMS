import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { BodyNode } from '@cms/types'
import { RichBody } from '@/templates/shared/RichBody'

const text = (value: string, ...marks: { type: string; attrs?: Record<string, unknown> }[]) => ({
  type: 'text',
  text: value,
  ...(marks.length ? { marks } : {}),
})
const para = (...content: object[]) => ({ type: 'paragraph', content })

const show = (nodes: object[]) => render(<RichBody nodes={nodes as BodyNode[]} />).container

describe('글 본문 그리기 (T-143)', () => {
  it('제목 · 서식 · 목록 · 인용 · 구분선 · 표', () => {
    const box = show([
      { type: 'heading', attrs: { level: 2, textAlign: 'center' }, content: [text('큰 제목')] },
      { type: 'heading', attrs: { level: 3 }, content: [text('작은 제목')] },
      para(
        text('굵게', { type: 'bold' }),
        text('기울임', { type: 'italic' }),
        text('밑줄', { type: 'underline' }),
        text('취소', { type: 'strike' }),
        text('색', { type: 'textStyle', attrs: { color: '#ff0000' } }),
        { type: 'hardBreak' },
        text('링크', { type: 'link', attrs: { href: 'https://a.com' } }),
      ),
      { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [para(text('셋'))] }] },
      { type: 'blockquote', content: [para(text('인용'))] },
      { type: 'horizontalRule' },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableHeader', attrs: { colspan: 2 }, content: [para(text('머리'))] },
              { type: 'tableCell', content: [para(text('칸'))] },
            ],
          },
        ],
      },
    ])
    expect(screen.getByRole('heading', { level: 2, name: '큰 제목' })).toHaveStyle({ textAlign: 'center' })
    expect(screen.getByRole('heading', { level: 3, name: '작은 제목' })).toBeInTheDocument()
    expect(box.querySelector('strong')).toHaveTextContent('굵게')
    expect(box.querySelector('em')).toHaveTextContent('기울임')
    expect(box.querySelector('u')).toHaveTextContent('밑줄')
    expect(box.querySelector('s')).toHaveTextContent('취소')
    expect(screen.getByText('색')).toHaveStyle({ color: '#ff0000' })
    expect(box.querySelector('br')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: '링크' })
    expect(link).toHaveAttribute('href', 'https://a.com')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow')
    expect(box.querySelector('ol')).toHaveAttribute('start', '3')
    expect(box.querySelector('blockquote')).toHaveTextContent('인용')
    expect(box.querySelector('hr')).toBeInTheDocument()
    expect(box.querySelector('th')).toHaveAttribute('colspan', '2')
    expect(box.querySelector('td')).toHaveTextContent('칸')
  })

  it('사진', () => {
    show([{ type: 'image', attrs: { src: '/a.webp', alt: '설명' } }])
    expect(screen.getByRole('img', { name: '설명' })).toHaveAttribute('src', '/a.webp')
  })

  it('이전 형식 — 굵게 · 줄바꿈 · 목록 · 사진', () => {
    const box = show([
      { type: 'p', text: '**굵게**\n둘째' },
      { type: 'ul', items: ['하나'] },
      { type: 'image', src: '/old.webp', alt: '옛 사진' },
    ])
    expect(box.querySelector('strong')).toHaveTextContent('굵게')
    expect(box.querySelector('br')).toBeInTheDocument()
    expect(box.querySelector('li')).toHaveTextContent('하나')
    expect(screen.getByRole('img', { name: '옛 사진' })).toHaveAttribute('src', '/old.webp')
  })

  describe('위험한 값은 그리지 않는다', () => {
    it('스크립트 글자는 글자로', () => {
      const box = show([para(text('<script>alert(1)</script><img src=x onerror=1>'))])
      expect(box.querySelector('script')).toBeNull()
      expect(box.querySelector('img')).toBeNull()
      expect(box).toHaveTextContent('<script>alert(1)</script>')
    })

    it.each(['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,x', '//evil.example'])(
      '링크 %s — 글자만 남긴다',
      (href) => {
        const box = show([para(text('글', { type: 'link', attrs: { href } }))])
        expect(box.querySelector('a')).toBeNull()
        expect(box).toHaveTextContent('글')
      },
    )

    it.each(['javascript:alert(1)', 'data:image/png;base64,A', '//evil/a.png'])('사진 %s', (src) => {
      expect(show([{ type: 'image', attrs: { src } }]).querySelector('img')).toBeNull()
      expect(show([{ type: 'image', src, alt: '' }]).querySelector('img')).toBeNull()
    })

    it('모르는 노드 · 잘못된 색 · 속성', () => {
      const box = show([
        { type: 'script', content: [text('x')] },
        { type: 'iframe', attrs: { src: 'https://evil' } },
        para(text('글', { type: 'textStyle', attrs: { color: 'red;background:url(x)' } })),
        { type: 'paragraph', attrs: { onclick: 'x', textAlign: 'evil' }, content: [text('둘')] },
      ])
      expect(box.querySelector('iframe, script')).toBeNull()
      expect(box.querySelector('span')).toBeNull()
      expect(screen.getByText('둘')).not.toHaveAttribute('onclick')
    })
  })
})
