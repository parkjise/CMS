import { type SitePolicy, policyDate, policyParagraphs } from '@/lib/sitePolicy'

/** 약관 · 방침 본문 — 테마형 (T-200 · T-224 버전). 글자만, 빈 줄로 문단 */
export function PolicyArticle({ policy }: { policy: SitePolicy }) {
  const history = policy.history ?? []
  const muted = 'text-sm text-[color:var(--color-text-muted)]'
  const link = 'underline underline-offset-2 hover:text-[color:var(--color-primary)]'
  return (
    <article className="mx-auto w-full max-w-3xl px-6 py-14 md:py-20">
      <h1 className="text-2xl font-bold text-[color:var(--color-text-primary)] md:text-3xl">
        {policy.title}
      </h1>
      {policy.updated_at && (
        <p className={`mt-2 ${muted}`}>
          {policy.version ? `v${policy.version} · ` : ''}시행일 {policyDate(policy.updated_at)}
        </p>
      )}
      {policy.archived && (
        <p
          className="mt-4 rounded-md bg-[var(--color-surface)] px-4 py-3 text-sm text-[color:var(--color-text-secondary)]"
          role="note"
        >
          이전 버전이에요. 지금 시행 중인 문서는{' '}
          <a href="?" className={link}>
            여기
          </a>
          에서 볼 수 있어요.
        </p>
      )}
      <div className="mt-8 space-y-5 border-t border-[color:var(--color-border)] pt-8 text-[15px] leading-7 text-[color:var(--color-text-secondary)]">
        {policyParagraphs(policy.body).map((paragraph, index) => (
          <p key={index} className="whitespace-pre-line break-words">
            {paragraph}
          </p>
        ))}
      </div>
      {history.length > 0 && (
        <nav
          className="mt-10 border-t border-[color:var(--color-border)] pt-6"
          aria-label="이전 버전"
        >
          <h2 className="text-sm font-semibold text-[color:var(--color-text-primary)]">
            이전 버전
          </h2>
          <ul className={`mt-2 space-y-1 ${muted}`}>
            {history.map((item) => (
              <li key={item.version}>
                <a
                  href={`?v=${item.version}`}
                  className={link}
                  aria-current={item.version === policy.version ? 'page' : undefined}
                >
                  v{item.version}
                  {item.effective_at ? ` · ${policyDate(item.effective_at)} 시행` : ''}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </article>
  )
}
