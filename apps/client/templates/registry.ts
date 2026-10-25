/**
 * 코드형 템플릿 레지스트리 (기획서 11.7).
 *
 * - 매니페스트·샘플은 정적 import (가벼움), 템플릿 화면·스타일은 load() 로 지연 로드해
 *   해당 테넌트가 쓰는 템플릿 청크만 내려받게 한다.
 * - 테마형 6종(lib/templates)은 여기에 없다 → 기존 SectionRenderer 로 렌더링.
 */
import type { PublicSite } from '@/lib/publicSite.types'
import { hospitalAManifest } from './hospital-a/manifest'
import { hospitalASample } from './hospital-a/sample-content'
import type { CodeTemplateEntry } from './shared/contracts'

export const CODE_TEMPLATES: CodeTemplateEntry[] = [
  {
    manifest: hospitalAManifest,
    sample: hospitalASample,
    load: () => import('./hospital-a/Template'),
  },
]

/** 템플릿 ID('TPL_HOSPITAL_A') 또는 폴더 키('hospital-a')로 찾는다 */
export function findCodeTemplate(
  idOrKey: string | null | undefined,
  entries: CodeTemplateEntry[] = CODE_TEMPLATES,
): CodeTemplateEntry | null {
  if (!idOrKey) return null
  const needle = idOrKey.trim().toLowerCase()
  return (
    entries.find(
      (e) => e.manifest.id.toLowerCase() === needle || e.manifest.key === needle,
    ) ?? null
  )
}

/**
 * 테넌트 사이트가 쓸 코드형 템플릿.
 * override(미리보기 ?tpl=) → 테넌트 템플릿 ID 순. 없으면 null (테마형).
 */
export function resolveCodeTemplate(
  site: PublicSite,
  override?: string | null,
  entries: CodeTemplateEntry[] = CODE_TEMPLATES,
): CodeTemplateEntry | null {
  if (override) return findCodeTemplate(override, entries)
  if (site.template?.renderer === 'theme') return null
  return findCodeTemplate(site.template?.code, entries)
}
