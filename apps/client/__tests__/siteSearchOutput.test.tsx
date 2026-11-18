import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import type { PublicBoard, PublicPostItem } from '@cms/types'
import { FaqJsonLd } from '@/components/board/FaqJsonLd'
import { bodyPlainText } from '@/lib/bodyText'
import { buildFaqJsonLd, buildLocalBusinessJsonLd } from '@/lib/jsonLd'
import type { PublicSite } from '@/lib/publicSite.types'
import { composeRobotsTxt } from '@/lib/robotsTxt'

// 사이트 관리 AEO · GEO 가 홈페이지에 나가는 모습 (T-221)

const site = (seo: Record<string, unknown> | null, sns: Record<string, unknown> | null = null) =>
  ({
    tenant: { id: 't', slug: 'clinic', name: 'OO치과', template_type: 'HOSPITAL' },
    sections: [],
    seo_settings: seo,
    sns_settings: sns,
    template: null,
  }) as unknown as PublicSite

describe('GEO → 사업체 구조화 데이터', () => {
  it('기업 소개가 검색 설명보다 먼저, 주제는 knowsAbout', () => {
    const jsonLd = buildLocalBusinessJsonLd(
      site({
        meta_description: '검색 설명',
        geo: {
          description: '임플란트 전문 치과',
          topics: ['임플란트', '교정'],
          profile_urls: [],
          crawlers: {},
        },
      })
    )
    expect(jsonLd.description).toBe('임플란트 전문 치과')
    expect(jsonLd.knowsAbout).toEqual(['임플란트', '교정'])
  })

  it('GEO 가 없거나 비면 예전대로', () => {
    const jsonLd = buildLocalBusinessJsonLd(site({ meta_description: '검색 설명', geo: null }))
    expect(jsonLd.description).toBe('검색 설명')
    expect(jsonLd.knowsAbout).toBeUndefined()
    const empty = buildLocalBusinessJsonLd(
      site({
        meta_description: '검색 설명',
        geo: { description: '', topics: [], profile_urls: [], crawlers: {} },
      })
    )
    expect(empty.description).toBe('검색 설명')
    expect(empty.knowsAbout).toBeUndefined()
  })

  it('공식 프로필 주소를 SNS 주소와 함께 sameAs 로 — 겹치면 한 번', () => {
    const jsonLd = buildLocalBusinessJsonLd(
      site(
        {
          geo: {
            description: '',
            topics: [],
            profile_urls: ['https://blog.naver.com/a', 'https://map.naver.com/p/1'],
            crawlers: {},
          },
        },
        { blog_url: 'https://blog.naver.com/a' }
      )
    )
    expect(jsonLd.sameAs).toEqual(['https://blog.naver.com/a', 'https://map.naver.com/p/1'])
  })
})

describe('글 본문 → 글자 (백엔드 body_text 와 같은 규칙)', () => {
  it('이전 블록 · 새 편집기 본문', () => {
    expect(
      bodyPlainText([
        { type: 'p', text: '**진료** 시간은\n평일입니다.' },
        { type: 'ul', items: ['월', '화'] },
        { type: 'image', src: 'x', alt: '사진' },
      ])
    ).toBe('진료 시간은\n평일입니다.\n월\n화')
    expect(
      bodyPlainText([
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '예약은 ' },
            { type: 'text', text: '전화로', marks: [{ type: 'bold' }] },
            { type: 'hardBreak' },
            { type: 'text', text: '가능합니다.' },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }],
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }],
            },
          ],
        },
      ])
    ).toBe('예약은 전화로\n가능합니다.\nA\nB')
    expect(bodyPlainText([])).toBe('')
  })
})

describe('AEO → FAQ 구조화 데이터', () => {
  const board = (extra: Partial<PublicBoard> = {}): PublicBoard => ({
    id: 'b1',
    name: '자주 묻는 질문',
    slug: 'faq',
    description: '',
    board_type: 'FAQ',
    faq_jsonld: true,
    ...extra,
  })
  const item = (
    title: string,
    text: string,
    extra: Partial<PublicPostItem> = {}
  ): PublicPostItem => ({
    id: title,
    title,
    is_pinned: false,
    published_at: '2026-11-19T00:00:00Z',
    body: text ? [{ type: 'p', text }] : [],
    ...extra,
  })
  const scripts = (container: HTMLElement) =>
    container.querySelectorAll('script[type="application/ld+json"]')

  it('보이는 질문 · 답변만 FAQPage 로 — 비밀글 · 빈 답변은 뺀다', () => {
    const { container } = render(
      <FaqJsonLd
        board={board()}
        posts={[
          item('진료 시간은?', '평일 9시'),
          item('비밀', '내용', { is_secret: true }),
          item('빈 답변', ''),
        ]}
      />
    )
    const [script] = scripts(container)
    expect(JSON.parse(script?.innerHTML ?? '')).toEqual(
      buildFaqJsonLd([{ question: '진료 시간은?', answer: '평일 9시' }])
    )
  })

  it('끈 게시판 · FAQ 가 아닌 게시판 · 넣을 질문이 없으면 그리지 않는다', () => {
    const posts = [item('질문', '답')]
    expect(
      scripts(render(<FaqJsonLd board={board({ faq_jsonld: false })} posts={posts} />).container)
    ).toHaveLength(0)
    expect(
      scripts(render(<FaqJsonLd board={board({ board_type: 'LIST' })} posts={posts} />).container)
    ).toHaveLength(0)
    expect(scripts(render(<FaqJsonLd board={board()} posts={[]} />).container)).toHaveLength(0)
  })

  it('스크립트를 닫는 글자는 이스케이프', () => {
    const { container } = render(<FaqJsonLd board={board()} posts={[item('</script><b>', '답')]} />)
    expect(scripts(container)[0]?.innerHTML).not.toContain('</script>')
  })
})

describe('GEO → robots.txt', () => {
  const base = 'User-Agent: *\nAllow: /\n'
  it('허용 · 차단만 더한다', () => {
    expect(composeRobotsTxt(base, { GPTBot: 'block', ClaudeBot: 'allow', CCBot: 'keep' })).toBe(
      `${base}\n# AI 크롤러 (사이트 관리 → GEO 설정)\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nAllow: /\n`
    )
  })
  it('정책이 없으면 그대로', () => {
    expect(composeRobotsTxt(base, {})).toBe(base)
  })
})
