/**
 * hospital-a 템플릿 전용 라우트용 엔트리 — 화면을 정적 import 해서
 * 이 템플릿의 CSS·JS 가 app/(code)/tpl-hospital-a 라우트에만 묶이게 한다 (기획서 11.11 #26).
 */
import type { CodeTemplateEntry } from '../shared/contracts'
import { hospitalAManifest } from './manifest'
import { hospitalASample } from './sample-content'
import HospitalATemplate from './Template'

export const hospitalAEntry: CodeTemplateEntry = {
  manifest: hospitalAManifest,
  sample: hospitalASample,
  load: async () => ({ default: HospitalATemplate }),
}
