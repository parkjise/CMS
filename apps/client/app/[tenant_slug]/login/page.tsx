interface Props {
  params: Promise<{ tenant_slug: string }>
}

// CLAUDE.md 7.1: 홈페이지에서 직접 로그인하는 진입점
// 실제 구현은 Phase 7 (T-070)에서 진행
export default async function TenantLoginPage({ params }: Props) {
  const { tenant_slug } = await params

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm p-8 bg-white rounded-2xl shadow-sm border border-slate-200">
        <h1 className="text-xl font-bold text-slate-900 mb-1">관리자 로그인</h1>
        <p className="text-sm text-slate-400 mb-6">{tenant_slug}</p>
        <p className="text-center text-xs text-slate-400">로그인 폼 — Phase 7에서 구현</p>
      </div>
    </div>
  )
}
