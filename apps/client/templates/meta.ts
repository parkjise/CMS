/**
 * 코드형 템플릿 메타 목록 — 매니페스트 · 샘플만 (화면 컴포넌트·스타일은 import 하지 않음).
 * 미들웨어와 라우팅 판단에 쓰므로 가볍게 유지한다 (기획서 11.11 #26).
 */
import { hospitalAManifest } from './hospital-a/manifest'
import { hospitalASample } from './hospital-a/sample-content'
import type { CodeTemplateMeta } from './shared/contracts'

export const CODE_TEMPLATE_META: CodeTemplateMeta[] = [
  { manifest: hospitalAManifest, sample: hospitalASample },
]

/** 템플릿 ID('TPL_HOSPITAL_A') 또는 폴더 키('hospital-a')로 찾는다 */
export function findTemplateMeta(
  idOrKey: string | null | undefined,
  list: CodeTemplateMeta[] = CODE_TEMPLATE_META,
): CodeTemplateMeta | null {
  if (!idOrKey) return null
  const needle = idOrKey.trim().toLowerCase()
  return list.find((t) => t.manifest.id.toLowerCase() === needle || t.manifest.key === needle) ?? null
}

export { CODE_ROUTE_PREFIX } from './manifests'
