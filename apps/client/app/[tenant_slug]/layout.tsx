import type { Metadata } from 'next'

interface Props {
  children: React.ReactNode
  params: Promise<{ tenant_slug: string }>
}

// 실제 SEO 메타는 Phase 7에서 API 데이터 기반으로 동적 생성
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant_slug } = await params

  return {
    title: tenant_slug,
    robots: { index: true, follow: true },
  }
}

export default async function TenantLayout({ children, params }: Props) {
  await params  // Next.js 15: params must be awaited before use

  return <>{children}</>
}
