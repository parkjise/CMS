import { type SitePolicy, policyDate, policyParagraphs } from '@/lib/sitePolicy'

/** 약관 · 방침 본문 — 테마형 (T-200). 글자만, 빈 줄로 문단 */
export function PolicyArticle({ policy }: { policy: SitePolicy }) {
  return (
    <article className="mx-auto w-full max-w-3xl px-6 py-14 md:py-20">
      <h1 className="text-2xl font-bold text-[color:var(--color-text-primary)] md:text-3xl">
        {policy.title}
      </h1>
      {policy.updated_at && (
        <p className="mt-2 text-sm text-[color:var(--color-text-muted)]">
          시행일 {policyDate(policy.updated_at)}
        </p>
      )}
      <div className="mt-8 space-y-5 border-t border-[color:var(--color-border)] pt-8 text-[15px] leading-7 text-[color:var(--color-text-secondary)]">
        {policyParagraphs(policy.body).map((paragraph, index) => (
          <p key={index} className="whitespace-pre-line break-words">
            {paragraph}
          </p>
        ))}
      </div>
    </article>
  )
}
