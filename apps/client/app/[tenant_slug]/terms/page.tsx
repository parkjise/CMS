import type { Metadata } from 'next'
import { renderThemePolicy, themePolicyMetadata } from '@/components/policy/ThemePolicyRoute'
import { policyVersionParam } from '@/lib/sitePolicy'

interface Props {
  params: Promise<{ tenant_slug: string }>
  searchParams: Promise<{ v?: string }>
}

/** 이용약관 — 테마형 (T-200) */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return themePolicyMetadata((await params).tenant_slug, 'terms')
}

export default async function TermsPage({ params, searchParams }: Props) {
  // ?v=2 — 이전 버전 (T-224)
  return renderThemePolicy(
    (await params).tenant_slug,
    'terms',
    policyVersionParam((await searchParams).v)
  )
}
