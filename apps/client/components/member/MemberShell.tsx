import Link from 'next/link'

interface MemberShellProps {
  slug: string
  siteName: string
  title: string
  subtitle?: string
  children: React.ReactNode
}

/** 방문자 회원 화면 공통 카드 — 테마 색상 변수 사용 (hospital-a 디자인은 T-124) */
const MemberShell = ({ slug, siteName, title, subtitle, children }: MemberShellProps) => (
  <main className="flex min-h-screen items-start justify-center bg-[var(--color-surface)] px-4 py-12 sm:items-center">
    <div className="w-full max-w-md rounded-[var(--border-radius-card)] border border-[color:var(--color-border)] bg-[var(--color-background)] p-6 shadow-[var(--shadow-card)] sm:p-8">
      <Link
        href={`/${slug}`}
        className="block text-center text-sm font-semibold text-[color:var(--color-text-secondary)]"
      >
        {siteName}
      </Link>
      <h1 className="mt-4 text-center text-2xl font-bold text-[color:var(--color-text-primary)]">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-2 text-center text-sm text-[color:var(--color-text-muted)]">{subtitle}</p>
      )}
      <div className="mt-8">{children}</div>
    </div>
  </main>
)

export default MemberShell
