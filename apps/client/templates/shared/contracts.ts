/**
 * 코드형 템플릿 공통 계약 (기획서 11.7).
 *
 * 템플릿마다 마크업·스타일(SCSS 또는 Tailwind)은 달라도, 받는 데이터 형태는 같다.
 * 그래서 관리자 편집(AD-02)·인라인 편집(12)·AI 어시스턴트(13)는 템플릿 종류를 몰라도 동작한다.
 */
import type { ComponentType } from 'react'
import type { SectionType, TemplateManifest } from '@cms/types'
import type { PublicSection, PublicSite } from '@/lib/publicSite.types'

/** 템플릿 섹션 컴포넌트가 받는 props */
export interface CodeSectionProps {
  section: PublicSection
  tenantSlug: string
  /** 테넌트에 실제 섹션이 있으면 true (인라인 편집 가능) — 샘플만으로 그린 섹션은 false */
  editable: boolean
}

/** 템플릿 루트 컴포넌트가 받는 props */
export interface CodeTemplateProps {
  site: PublicSite
  tenantSlug: string
  /** 현재 페이지 키 ('home' | 'about' …) */
  pageKey: string
  /** 페이지에 그릴 섹션 (샘플 콘텐츠와 합쳐진 결과 — resolvePageSections) */
  sections: ResolvedSection[]
  /** 사이트 공통 정보 (헤더·푸터·퀵메뉴) — 샘플 + 테넌트 값 */
  siteInfo: Record<string, string>
  /** 미리보기 모드 (편집 UI 없음) */
  preview: boolean
  /**
   * 미리보기 링크용 쿼리 ('tpl=TPL_X&content=mine') — 있으면 페이지 링크를
   * /{slug}/preview?{query}&page={key} 로 만들어 미리보기 안에서 이동한다
   */
  previewQuery?: string
  /** 게시판 상세·글쓰기 ('{글 id}' | 'write') — /{slug}/{page}/{id} */
  detailId?: string
  /** 목록 검색어(q) · 페이지(p) */
  query?: { q?: string; p?: string }
}

export interface HrefExtra {
  /** 게시판 상세·글쓰기 */
  id?: string
  q?: string
  p?: number | string
}

/**
 * 페이지 주소 — 실제: /{slug} · /{slug}/{key}[/{id}][?q=&p=]
 * 미리보기: /{slug}/preview?{previewQuery}&page={key}[&id=][&q=&p=]
 */
export function pageHref(
  slug: string,
  key: string,
  previewQuery?: string,
  extra: HrefExtra = {},
): string {
  const params = new URLSearchParams()
  if (extra.q) params.set('q', extra.q)
  if (extra.p && Number(extra.p) > 1) params.set('p', String(extra.p))
  if (previewQuery) {
    const preview = new URLSearchParams(previewQuery)
    if (key !== 'home') preview.set('page', key)
    if (extra.id) preview.set('id', extra.id)
    params.forEach((value, name) => preview.set(name, value))
    return `/${slug}/preview?${preview.toString()}`
  }
  const path = key === 'home' ? `/${slug}` : `/${slug}/${key}${extra.id ? `/${extra.id}` : ''}`
  const search = params.toString()
  return search ? `${path}?${search}` : path
}

/** 샘플 콘텐츠의 섹션 하나 — 값은 문자열, 목록은 배열/객체 그대로 (렌더링 시 JSON 직렬화) */
export interface SampleSection {
  section_type: SectionType
  label: string
  settings: Record<string, string | unknown[] | Record<string, unknown>>
}

/** 템플릿 샘플 콘텐츠 (기획서 11.8) — 처음 적용할 때 테넌트 데이터로 복사되는 원본 */
export interface SampleContent {
  version: string
  /** 사이트 공통 정보 (상호·연락처·운영 시간·주소 등) */
  site: Record<string, string>
  /** 페이지 키 → 섹션 목록 */
  pages: Record<string, SampleSection[]>
}

export interface ResolvedSection {
  section: PublicSection
  editable: boolean
  /** 아직 샘플 값을 쓰고 있는 설정 키 */
  sampleKeys: string[]
}

export interface CodeTemplateEntry {
  manifest: TemplateManifest
  sample: SampleContent
  /** 템플릿 루트 컴포넌트 지연 로드 — 템플릿별 청크로 분리 */
  load: () => Promise<{ default: ComponentType<CodeTemplateProps> }>
}
