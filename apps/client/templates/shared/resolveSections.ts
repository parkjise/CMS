import type { TemplateManifest } from '@cms/types'
import type {
  PublicSection,
  PublicSettingItem,
  PublicSite,
} from '@/lib/publicSite.types'
import type { ResolvedSection, SampleContent, SampleSection } from './contracts'

const SAMPLE_ID_PREFIX = 'sample:'

export function isSampleSectionId(id: string): boolean {
  return id.startsWith(SAMPLE_ID_PREFIX)
}

function toSettingItems(settings: SampleSection['settings']): PublicSettingItem[] {
  return Object.entries(settings).map(([key, value]) => ({
    field_key: key,
    field_value: typeof value === 'string' ? value : JSON.stringify(value),
    value_type: typeof value === 'string' ? 'STRING' : 'JSON',
  }))
}

function hasValue(item: PublicSettingItem): boolean {
  return item.field_value != null && item.field_value.trim() !== ''
}

/**
 * 페이지에 그릴 섹션 목록을 만든다 (기획서 11.8 · 11.9).
 *
 * - 매니페스트 페이지의 default_sections 순서대로
 * - 같은 타입이 여러 번 나오면(CONTENT_BLOCK 등) 순서대로 짝을 맞춘다:
 *   n번째 자리 ↔ 테넌트의 같은 페이지·타입 섹션 중 display_order n번째 ↔ 샘플의 n번째
 * - 테넌트에 같은 타입 섹션이 있으면 그 값을 쓰고, 비어 있는 키만 샘플로 채운다
 * - 테넌트 섹션이 비활성(is_active=false)이면 그리지 않는다
 * - 테넌트에 없으면 샘플만으로 그리고 편집 불가로 표시한다
 *   (샘플은 템플릿 적용 시 테넌트 데이터로 복사되는 것이 원칙 — T-120)
 */
export function resolvePageSections(
  manifest: TemplateManifest,
  sample: SampleContent,
  tenantSections: PublicSection[],
  pageKey: string,
): ResolvedSection[] {
  const page = manifest.pages.find((p) => p.key === pageKey)
  if (!page) return []

  const samples = sample.pages[pageKey] ?? []
  const result: ResolvedSection[] = []
  const seen = new Map<string, number>()
  const tenantOnPage = tenantSections
    .filter((s) => (s.page_key ?? 'home') === pageKey)
    .sort((a, b) => a.display_order - b.display_order)

  page.default_sections.forEach((type, index) => {
    const nth = seen.get(type) ?? 0
    seen.set(type, nth + 1)
    if (!manifest.sections.includes(type)) return

    const tenant = tenantOnPage.filter((s) => s.section_type === type)[nth]
    if (tenant && !tenant.is_active) return

    const sampleSection = samples.filter((s) => s.section_type === type)[nth]
    if (!tenant && !sampleSection) return

    const merged = new Map<string, PublicSettingItem>()
    const sampleKeys = new Set<string>()
    for (const item of sampleSection ? toSettingItems(sampleSection.settings) : []) {
      merged.set(item.field_key, item)
      sampleKeys.add(item.field_key)
    }
    for (const item of tenant?.settings ?? []) {
      if (!hasValue(item)) continue
      merged.set(item.field_key, item)
      sampleKeys.delete(item.field_key)
    }

    result.push({
      section: {
        id: tenant?.id ?? `${SAMPLE_ID_PREFIX}${pageKey}:${type}:${nth}`,
        section_type: type,
        label: tenant?.label ?? sampleSection?.label ?? type,
        display_order: index,
        is_active: true,
        settings: [...merged.values()],
      },
      editable: Boolean(tenant),
      sampleKeys: [...sampleKeys],
    })
  })

  return result
}

/**
 * 사업체 정보 칸 — 실제 홈페이지에는 샘플 값을 쓰지 않는다 (가짜 전화 · 사업자번호 노출 방지).
 * 관리자 공통 설정(T-036-A)에 입력한 값만, 비어 있으면 "" 로 두어 화면이 숨긴다.
 */
const BUSINESS_KEYS = [
  'phone',
  'email',
  'address',
  'hours_weekday',
  'hours_saturday',
  'hours_note',
  'parking',
  'ceo',
  'business_number',
] as const

/** 주소로 지도 길찾기 링크를 만든다 (주소가 없으면 링크 없음) */
export function mapLinks(address: string): Record<'naver_map_url' | 'kakao_map_url' | 'tmap_url', string> {
  if (!address) return { naver_map_url: '', kakao_map_url: '', tmap_url: '' }
  const q = encodeURIComponent(address)
  return {
    naver_map_url: `https://map.naver.com/p/search/${q}`,
    kakao_map_url: `https://map.kakao.com/?q=${q}`,
    // 티맵은 웹 검색 주소가 없다 — 링크 숨김
    tmap_url: '',
  }
}

/**
 * 사이트 공통 정보 — 템플릿 기본값(디자인 · 약관 링크 등) 위에 테넌트 정보를 덮어쓴다.
 * 사업체 정보 · 카카오 링크는 샘플 대신 실제 값만 (T-036-A).
 */
export function resolveSiteInfo(
  sample: SampleContent,
  site: PublicSite,
): Record<string, string> {
  const info: Record<string, string> = { ...sample.site, brand_name: site.tenant.name }
  const settings = site.site_settings
  for (const key of BUSINESS_KEYS) info[key] = settings?.[key] ?? ''
  if (info.address && settings?.address_detail) {
    info.address = `${info.address} ${settings.address_detail}`
  }
  Object.assign(info, mapLinks(info.address))
  // 로고를 올리지 않았으면 템플릿 기본 로고(글자 없는 표식)
  if (settings?.logo_url) info.logo_url = settings.logo_url
  info.kakao_url = site.sns_settings?.kakao_url ?? ''
  const youtube = site.sns_settings?.youtube_url
  if (youtube) info.youtube_url = youtube
  return info
}
