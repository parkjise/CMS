import type { Metadata } from 'next'
import { renderThemePolicy, themePolicyMetadata } from '@/components/policy/ThemePolicyRoute'

interface Props {
  params: Promise<{ tenant_slug: string }>
}

/** 개인정보처리방침 — 테마형 (T-200) */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return themePolicyMetadata((await params).tenant_slug, 'privacy')
}

export default async function PrivacyPage({ params }: Props) {
  return renderThemePolicy((await params).tenant_slug, 'privacy')
}
