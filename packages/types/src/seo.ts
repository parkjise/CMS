/** AI 크롤러 접근 정책 (T-221, 사이트 관리 GEO) — keep 은 robots.txt 에 아무것도 더하지 않는다 */
export type CrawlerPolicy = 'keep' | 'allow' | 'block'

export interface GeoEvidence {
  claim: string
  url: string
  /** YYYY-MM-DD */
  checked_at: string | null
}

/** 기업 · 브랜드 사실 정보와 AI 크롤러 정책 (T-221) */
export interface GeoSettings {
  description: string
  topics: string[]
  profile_urls: string[]
  evidence: GeoEvidence[]
  /** User-agent → 정책. 저장된 값에는 keep 이 없다 */
  crawlers: Record<string, CrawlerPolicy>
}

/** 홈페이지에 나가는 GEO — 출처 목록은 관리용이라 빠진다 */
export type PublicGeo = Omit<GeoSettings, 'evidence'>

export interface AiCrawler {
  name: string
  label: string
}

export interface GeoResponse {
  settings: GeoSettings
  crawlers: AiCrawler[]
}

/** AEO 화면의 FAQ 글 한 개 (T-221) */
export interface AeoItem {
  post_id: string
  question: string
  answer: string
  /** 홈페이지에 보이는 글 — 아니면 구조화 데이터에서 빠진다 */
  public: boolean
  /** 빠지는 까닭 */
  note: string | null
}

export interface AeoBoard {
  id: string
  name: string
  slug: string
  active: boolean
  member_only: boolean
  items: AeoItem[]
}

export interface AeoResponse {
  faq_board_ids: string[]
  boards: AeoBoard[]
}
