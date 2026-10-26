import { fetchPublicSite } from '@/lib/publicSite'

/** 회원 화면 공통 — 상단 사이트 이름 (layout 에서 존재 확인, fetch 는 캐시됨) */
export const siteNameOf = async (slug: string): Promise<string> =>
  (await fetchPublicSite(slug))?.tenant.name ?? slug

export const firstParam = (value: string | string[] | undefined): string | null =>
  (Array.isArray(value) ? value[0] : value) ?? null

export interface MemberPageProps {
  params: Promise<{ tenant_slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}
