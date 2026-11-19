import type { Metadata } from 'next'
import { renderThemePolicy, themePolicyMetadata } from '@/components/policy/ThemePolicyRoute'
import { policyVersionParam } from '@/lib/sitePolicy'

interface Props {
  params: Promise<{ tenant_slug: string }>
  searchParams: Promise<{ v?: string }>
}

/** 개인정보처리방침 — 테마형 (T-200) */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return themePolicyMetadata((await params).tenant_slug, 'privacy')
}

export default async function PrivacyPage({ params, searchParams }: Props) {
  // ?v=2 — 이전 버전 (T-224)
  return renderThemePolicy(
    (await params).tenant_slug,
    'privacy',
    policyVersionParam((await searchParams).v)
  )
}
