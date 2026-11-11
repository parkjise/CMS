import { POLICY_TITLES, type PolicyKind, policyHref } from '@/lib/sitePolicy'

const KINDS: PolicyKind[] = ['terms', 'privacy']

/** 동의 체크박스 아래 [보기] — 새 탭에서 연다 (T-200, 상위 기획서 16.3) */
export function PolicyLinks({ slug, className = '' }: { slug: string; className?: string }) {
  return (
    <p className={`flex flex-wrap gap-x-3 text-xs ${className}`}>
      {KINDS.map((kind) => (
        <a
          key={kind}
          href={policyHref(slug, kind)}
          target="_blank"
          rel="noreferrer"
          className="text-[color:var(--color-text-muted)] underline underline-offset-2 hover:text-[color:var(--color-primary)]"
        >
          {POLICY_TITLES[kind]} 보기
        </a>
      ))}
    </p>
  )
}
