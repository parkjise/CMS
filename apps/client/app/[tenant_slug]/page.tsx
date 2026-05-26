interface Props {
  params: Promise<{ tenant_slug: string }>
}

// Phase 7에서 실제 섹션 렌더링 구현
// 현재는 초기 설정 플레이스홀더
export default async function TenantHomePage({ params }: Props) {
  const { tenant_slug } = await params

  return (
    <main className="min-h-screen flex flex-col items-center justify-center">
      <h1 className="text-3xl font-bold text-slate-900">{tenant_slug}</h1>
      <p className="mt-2 text-slate-500">홈페이지 — Phase 7에서 섹션 렌더링 구현</p>
    </main>
  )
}
