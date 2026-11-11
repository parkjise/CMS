import type { Metadata } from 'next'
import { renderThemePolicy, themePolicyMetadata } from '@/components/policy/ThemePolicyRoute'

interface Props {
  params: Promise<{ tenant_slug: string }>
}

/** 이용약관 — 테마형 (T-200) */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return themePolicyMetadata((await params).tenant_slug, 'terms')
}

export default async function TermsPage({ params }: Props) {
  return renderThemePolicy((await params).tenant_slug, 'terms')
}
