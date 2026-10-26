/**
 * 코드형 템플릿 레지스트리 — 미리보기 전용 (기획서 11.7).
 *
 * 실제 테넌트 페이지는 미들웨어가 템플릿 전용 라우트(app/(code)/tpl-{key})로 보내므로
 * 이 파일을 쓰지 않는다. 여기를 import 하는 라우트에는 모든 코드형 템플릿 화면이 함께 묶인다
 * (미리보기는 어떤 템플릿이든 열어야 하므로 괜찮음 — 테마형 라우트에서는 import 금지).
 * 테마형 6종(lib/templates)은 여기에 없다 → 기존 SectionRenderer 로 렌더링.
 */
import type { PublicSite } from '@/lib/publicSite.types'
import { CODE_TEMPLATE_META, findTemplateMeta } from './meta'
import type { CodeTemplateEntry } from './shared/contracts'

const LOADERS: Record<string, CodeTemplateEntry['load']> = {
  'hospital-a': () => import('./hospital-a/Template'),
}

export const CODE_TEMPLATES: CodeTemplateEntry[] = CODE_TEMPLATE_META.map((meta) => ({
  ...meta,
  load: LOADERS[meta.manifest.key],
}))

/** 템플릿 ID('TPL_HOSPITAL_A') 또는 폴더 키('hospital-a')로 찾는다 */
export function findCodeTemplate(
  idOrKey: string | null | undefined,
  entries: CodeTemplateEntry[] = CODE_TEMPLATES,
): CodeTemplateEntry | null {
  const meta = findTemplateMeta(idOrKey, entries)
  return meta ? (meta as CodeTemplateEntry) : null
}

/**
 * 테넌트 사이트가 쓸 코드형 템플릿.
 * override(미리보기 ?tpl=) → 테넌트 템플릿 코드 순. 없으면 null (테마형).
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
