import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { TemplateManifest } from '@cms/types'
import type { PublicSection, PublicSite } from '@/lib/publicSite.types'
import { findCodeTemplate, resolveCodeTemplate } from '@/templates/registry'
import { CodeTemplateRenderer } from '@/templates/CodeTemplateRenderer'
import {
  isSampleSectionId,
  resolvePageSections,
  resolveSiteInfo,
} from '@/templates/shared/resolveSections'
import { TemplateText } from '@/templates/shared/TemplateText'
import type {
  CodeTemplateEntry,
  CodeTemplateProps,
  SampleContent,
} from '@/templates/shared/contracts'

const manifest: TemplateManifest = {
  key: 'test-code',
  id: 'TPL_TEST_CODE',
  name: '테스트 코드형',
  renderer: 'code',
  styling: 'scss',
  version: '1.0.0',
  pages: [
    {
      key: 'home',
      title: '홈',
      menu: 'none',
      default_sections: ['HERO_SLIDER', 'INTRO', 'SERVICES', 'FAQ'],
    },
  ],
  sections: ['HERO_SLIDER', 'INTRO', 'SERVICES'],
  css_variables: { primary: '#0ea5a0' },
}

const sample: SampleContent = {
  version: '1.0.0',
  site: { phone: '02-0000-0000', brand_name: '샘플 상호' },
  pages: {
    home: [
      {
        section_type: 'HERO_SLIDER',
        label: '메인 비주얼',
        settings: { slides: [{ title: '샘플 슬라이드' }] },
      },
      {
        section_type: 'INTRO',
        label: '브랜드 소개',
        settings: { title: '샘플 제목', description: '샘플 설명' },
      },
      {
        section_type: 'SERVICES',
        label: '서비스',
        settings: { title: '샘플 서비스' },
      },
    ],
  },
}

function makeSection(overrides: Partial<PublicSection>): PublicSection {
  return {
    id: 'sec-1',
    section_type: 'INTRO',
    label: '소개',
    display_order: 0,
    is_active: true,
    settings: [],
    ...overrides,
  }
}

function makeSite(overrides: Partial<PublicSite> = {}): PublicSite {
  return {
    tenant: {
      id: 't-1',
      slug: 'demo',
      name: '데모 상호',
      template_type: 'GENERAL',
      plan_type: 'BASIC',
      custom_domain: null,
    },
    sections: [],
    seo_settings: null,
    sns_settings: null,
    template: null,
    ...overrides,
  }
}

function FakeTemplate({ sections, siteInfo, pageKey }: CodeTemplateProps) {
  return (
    <main>
      <p>page:{pageKey}</p>
      <p>brand:{siteInfo.brand_name}</p>
      <ul>
        {sections.map((s) => (
          <li key={s.section.id}>{s.section.section_type}</li>
        ))}
      </ul>
    </main>
  )
}

const entry: CodeTemplateEntry = {
  manifest,
  sample,
  load: async () => ({ default: FakeTemplate }),
}

describe('코드형 템플릿 레지스트리 (T-118)', () => {
  it('템플릿 ID 또는 폴더 키로 찾는다 (대소문자 무시)', () => {
    expect(findCodeTemplate('TPL_TEST_CODE', [entry])).toBe(entry)
    expect(findCodeTemplate('tpl_test_code', [entry])).toBe(entry)
    expect(findCodeTemplate('test-code', [entry])).toBe(entry)
  })

  it('없는 키·빈 값은 null (테마형으로 렌더링)', () => {
    expect(findCodeTemplate('warm-trust', [entry])).toBeNull()
    expect(findCodeTemplate('', [entry])).toBeNull()
    expect(findCodeTemplate(null, [entry])).toBeNull()
  })

  it('미리보기 override 가 테넌트 템플릿보다 우선한다', () => {
    const site = makeSite({
      template: {
        template_id: 'TPL_OTHER',
        template_type: 'GENERAL',
        name: '다른 템플릿',
        css_variables: {},
        section_layouts: [],
      },
    })
    expect(resolveCodeTemplate(site, 'test-code', [entry])).toBe(entry)
    expect(resolveCodeTemplate(site, null, [entry])).toBeNull()
  })

  it('테넌트 템플릿 ID 가 코드형이면 해당 템플릿을 고른다', () => {
    const site = makeSite({
      template: {
        template_id: 'TPL_TEST_CODE',
        template_type: 'HOSPITAL',
        name: '테스트',
        css_variables: {},
        section_layouts: [],
      },
    })
    expect(resolveCodeTemplate(site, undefined, [entry])).toBe(entry)
  })
})

describe('페이지 섹션 합치기 — 샘플 콘텐츠 (T-118)', () => {
  it('테넌트 섹션이 없으면 샘플로 그리고 편집 불가', () => {
    const result = resolvePageSections(manifest, sample, [], 'home')
    expect(result.map((r) => r.section.section_type)).toEqual([
      'HERO_SLIDER',
      'INTRO',
      'SERVICES',
    ])
    expect(result.every((r) => !r.editable)).toBe(true)
    expect(result.every((r) => isSampleSectionId(r.section.id))).toBe(true)
  })

  it('테넌트 값이 있으면 그 값을 쓰고, 빈 키만 샘플로 채운다', () => {
    const tenant = makeSection({
      id: 'intro-1',
      settings: [
        { field_key: 'title', field_value: '우리 제목', value_type: 'STRING' },
        { field_key: 'description', field_value: '  ', value_type: 'STRING' },
      ],
    })
    const [, intro] = resolvePageSections(manifest, sample, [tenant], 'home')
    expect(intro.editable).toBe(true)
    expect(intro.section.id).toBe('intro-1')
    const value = (key: string) =>
      intro.section.settings.find((s) => s.field_key === key)?.field_value
    expect(value('title')).toBe('우리 제목')
    expect(value('description')).toBe('샘플 설명')
    expect(intro.sampleKeys).toEqual(['description'])
  })

  it('목록 샘플은 JSON 문자열로 넘긴다', () => {
    const [hero] = resolvePageSections(manifest, sample, [], 'home')
    const slides = hero.section.settings.find((s) => s.field_key === 'slides')
    expect(slides?.value_type).toBe('JSON')
    expect(JSON.parse(slides?.field_value ?? '[]')).toEqual([{ title: '샘플 슬라이드' }])
  })

  it('비활성 테넌트 섹션과 템플릿 미지원 타입은 그리지 않는다', () => {
    const hidden = makeSection({ id: 'svc', section_type: 'SERVICES', is_active: false })
    const result = resolvePageSections(manifest, sample, [hidden], 'home')
    const types = result.map((r) => r.section.section_type)
    expect(types).not.toContain('SERVICES')
    expect(types).not.toContain('FAQ')
  })

  it('없는 페이지 키는 빈 목록', () => {
    expect(resolvePageSections(manifest, sample, [], 'nope')).toEqual([])
  })

  it('사이트 정보는 샘플 위에 테넌트 상호·SNS 를 덮어쓴다', () => {
    const site = makeSite({
      sns_settings: {
        kakao_url: 'https://pf.kakao.com/demo',
        instagram_url: null,
        facebook_url: null,
        youtube_url: null,
        blog_url: null,
        naver_url: null,
      },
    })
    const info = resolveSiteInfo(sample, site)
    expect(info.brand_name).toBe('데모 상호')
    expect(info.phone).toBe('02-0000-0000')
    expect(info.kakao_url).toBe('https://pf.kakao.com/demo')
  })
})

describe('TemplateText (T-118)', () => {
  const section = makeSection({
    id: 'intro-1',
    settings: [{ field_key: 'title', field_value: '첫 줄\n둘째 줄', value_type: 'STRING' }],
  })

  it('편집 가능한 섹션은 EditableText 로 그린다', () => {
    render(<TemplateText section={section} editable field="title" as="h2" multiline />)
    const el = screen.getByRole('heading', { level: 2 })
    expect(el).toHaveAttribute('data-editable', 'text')
    expect(el).toHaveAttribute('data-section-id', 'intro-1')
    expect(el.className).toContain('u-pre-line')
  })

  it('샘플 섹션은 일반 태그로 그린다', () => {
    render(<TemplateText section={section} editable={false} field="title" as="p" className="x" />)
    const el = screen.getByText(/첫 줄/)
    expect(el.tagName).toBe('P')
    expect(el).not.toHaveAttribute('data-editable')
    expect(el).toHaveClass('x')
  })

  it('값이 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(
      <TemplateText section={section} editable={false} field="missing" />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('CodeTemplateRenderer (T-118)', () => {
  const site = makeSite({
    template: {
      template_id: 'TPL_TEST_CODE',
      template_type: 'HOSPITAL',
      name: '테스트',
      css_variables: { primary: '#ff0000' },
      section_layouts: [],
    },
  })

  it('data-template 루트 아래에 템플릿을 그리고 테넌트 색상을 덮어쓴다', async () => {
    const ui = await CodeTemplateRenderer({ entry, site, tenantSlug: 'demo', pageKey: 'home' })
    const { container } = render(ui)
    const root = container.querySelector('[data-template="test-code"]')
    expect(root).not.toBeNull()
    expect(root).toHaveAttribute('data-template-version', '1.0.0')
    expect(container.querySelector('style')?.textContent).toContain('--color-primary: #ff0000')
    expect(screen.getByText('brand:데모 상호')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('미리보기는 테넌트 색상을 덮어쓰지 않는다 (템플릿 기본 토큰)', async () => {
    const ui = await CodeTemplateRenderer({
      entry,
      site,
      tenantSlug: 'demo',
      pageKey: 'home',
      preview: true,
    })
    const { container } = render(ui)
    expect(container.querySelector('style')).toBeNull()
  })
})
