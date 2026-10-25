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

  page.default_sections.forEach((type, index) => {
    if (!manifest.sections.includes(type)) return

    const tenant = tenantSections.find((s) => s.section_type === type)
    if (tenant && !tenant.is_active) return

    const sampleSection = samples.find((s) => s.section_type === type)
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
        id: tenant?.id ?? `${SAMPLE_ID_PREFIX}${pageKey}:${type}`,
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

/** 사이트 공통 정보 — 샘플 값 위에 테넌트 정보(상호·SNS)를 덮어쓴다 */
export function resolveSiteInfo(
  sample: SampleContent,
  site: PublicSite,
): Record<string, string> {
  const info: Record<string, string> = { ...sample.site, brand_name: site.tenant.name }
  const kakao = site.sns_settings?.kakao_url
  if (kakao) info.kakao_url = kakao
  const youtube = site.sns_settings?.youtube_url
  if (youtube) info.youtube_url = youtube
  return info
}
