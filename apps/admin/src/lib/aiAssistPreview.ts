import type { AssistKind, AssistResponse, AssistTone } from '@/lib/aiAssist'

/**
 * 미리보기 모드의 예시 결과 (T-231-A) — 개발 서버에서만 읽는다(동적 import).
 * 서버 응답과 같은 모양이라 서버를 붙여도 화면은 그대로다.
 */
const SEO: Record<AssistTone, AssistResponse<'seo'>['result']> = {
  trust: {
    meta_title: '바른치과의원 | 강남역 임플란트 · 치아 교정',
    meta_description:
      '강남역 2번 출구 앞 바른치과의원입니다. 임플란트와 치아 교정을 전문으로, 진료 전 충분한 상담으로 치료 계획을 함께 정합니다. 평일 야간 진료.',
    keywords: ['강남 치과', '임플란트', '치아 교정', '강남역 치과', '야간 진료'],
  },
  friendly: {
    meta_title: '바른치과의원 — 강남역에서 편하게 만나는 치과',
    meta_description:
      '치과가 무서운 분도 편하게 오세요. 강남역 바로 앞, 임플란트 · 교정 · 스케일링까지 꼼꼼하게 상담해 드려요. 퇴근 뒤 야간 진료도 해요.',
    keywords: ['강남 치과', '편한 치과', '임플란트', '교정', '스케일링'],
  },
  expert: {
    meta_title: '바른치과의원 | 임플란트 · 교정 진료 (강남)',
    meta_description:
      '바른치과의원은 임플란트 식립과 치아 교정 진료를 중심으로 정밀 진단 후 치료 계획을 세웁니다. 강남역 인근, 평일 야간 진료.',
    keywords: ['임플란트 식립', '치아 교정', '정밀 진단', '강남 치과', '치과 진료'],
  },
}

const GEO: Record<AssistTone, AssistResponse<'geo'>['result']> = {
  trust: {
    description:
      '바른치과의원은 강남역 인근에서 임플란트와 치아 교정을 중심으로 진료하는 치과입니다. 진료 전 상담에서 치료 방법과 기간, 비용을 먼저 안내하고, 평일 야간 진료로 직장인도 다니기 쉽게 운영합니다.',
    topics: ['임플란트', '치아 교정', '스케일링', '야간 진료', '강남 치과'],
  },
  friendly: {
    description:
      '강남역 앞 바른치과의원이에요. 임플란트와 교정을 주로 보고, 처음 오신 분께는 치료 과정을 쉽게 설명해 드려요. 평일 저녁에도 진료해요.',
    topics: ['임플란트', '교정', '스케일링', '야간 진료'],
  },
  expert: {
    description:
      '바른치과의원은 임플란트 식립과 교정 치료를 전문 분야로 하며, 진단 결과에 따른 단계별 치료 계획을 제공합니다. 강남역 인근에 있으며 평일 야간 진료를 운영합니다.',
    topics: ['임플란트 식립', '교정 치료', '정밀 진단', '치주 치료', '야간 진료'],
  },
}

let used = 3

export async function previewAssist<K extends AssistKind>(
  kind: K,
  tone: AssistTone
): Promise<AssistResponse<K>> {
  await new Promise((resolve) => window.setTimeout(resolve, 600))
  used += 1
  const result = (kind === 'seo' ? SEO[tone] : GEO[tone]) as AssistResponse<K>['result']
  return { result, usage: { used, limit: 20, remaining: Math.max(20 - used, 0) } }
}
