export type PlanKey = 'BASIC' | 'STANDARD' | 'PREMIUM'

export interface PlanDefinition {
  key: PlanKey
  name: string
  tagline: string
  monthlyPrice: number // 원
  features: string[]
  target: string
  highlighted?: boolean
  // 정량 한도 (사용 현황 프로그레스 계산용)
  storageGb: number
  inquiryRetentionDays: number | null // null = 영구
  monthlyNotifications: number // 0 = 미지원
}

export const PLANS: PlanDefinition[] = [
  {
    key: 'BASIC',
    name: 'Basic',
    tagline: '시작하는 사장님을 위한 최소 구성',
    monthlyPrice: 39_000,
    target: '개인사업자 초기',
    storageGb: 1,
    inquiryRetentionDays: 30,
    monthlyNotifications: 0,
    features: [
      '페이지 섹션 5개 고정',
      '이미지 스토리지 1GB',
      '문의 보관 30일',
      '알림톡/SMS 미지원',
      'SEO 기본 (제목/설명)',
      'SNS 연동 2개',
      '이메일 지원 (5영업일)',
    ],
  },
  {
    key: 'STANDARD',
    name: 'Standard',
    tagline: '활발히 운영하는 비즈니스에 적합',
    monthlyPrice: 89_000,
    target: '활성 운영 업체',
    highlighted: true,
    storageGb: 5,
    inquiryRetentionDays: 180,
    monthlyNotifications: 100,
    features: [
      '섹션 10개 + 순서 변경',
      '이미지 스토리지 5GB',
      '문의 보관 180일',
      '알림톡/SMS 월 100건',
      'SEO 고급 (키워드 + 사이트맵)',
      'SNS 연동 4개',
      '이메일 지원 (1영업일)',
    ],
  },
  {
    key: 'PREMIUM',
    name: 'Premium',
    tagline: '마케팅에 집중하는 성장 단계',
    monthlyPrice: 189_000,
    target: '마케팅 집중 업체',
    storageGb: 20,
    inquiryRetentionDays: null,
    monthlyNotifications: 1_000_000,
    features: [
      '섹션 무제한 + 드래그 정렬',
      '이미지 스토리지 20GB',
      '문의 영구 보관',
      '알림톡/SMS 무제한',
      'SEO 풀옵션 + 분석 리포트',
      'SNS 연동 무제한',
      '전담 슬랙 채널',
    ],
  },
]

export function getPlan(key: PlanKey): PlanDefinition {
  return PLANS.find((p) => p.key === key) ?? PLANS[0]
}
