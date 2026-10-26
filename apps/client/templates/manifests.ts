/**
 * 코드형 템플릿 매니페스트 목록 — 미들웨어(edge)용으로 가장 가볍게 (샘플·화면 import 없음).
 */
import { hospitalAManifest } from './hospital-a/manifest'

export const CODE_TEMPLATE_MANIFESTS = [hospitalAManifest]

/** 템플릿 전용 내부 라우트 접두어 — app/(code)/tpl-{key} (미들웨어 rewrite 대상, 직접 접근은 404) */
export const CODE_ROUTE_PREFIX = 'tpl-'

/** 템플릿 ID('TPL_HOSPITAL_A') → 폴더 키('hospital-a') */
export function codeTemplateKey(code: string | null | undefined): string | null {
  if (!code) return null
  const needle = code.trim().toLowerCase()
  return CODE_TEMPLATE_MANIFESTS.find((m) => m.id.toLowerCase() === needle || m.key === needle)?.key ?? null
}
