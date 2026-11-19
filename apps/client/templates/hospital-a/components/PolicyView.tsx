import { type SitePolicy, policyDate, policyParagraphs } from '@/lib/sitePolicy'

/** 이용약관 · 개인정보처리방침 본문 — hospital-a (T-200 · T-224 버전) */
export function PolicyView({ policy }: { policy: SitePolicy }) {
  const history = policy.history ?? []
  return (
    <section className="policy-view" aria-labelledby="policy-view-title">
      <div className="page-container">
        <article className="policy-view__article">
          <header className="policy-view__head">
            <h2 className="policy-view__title" id="policy-view-title">
              {policy.title}
            </h2>
            {policy.updated_at && (
              <p className="policy-view__date">
                {policy.version ? `v${policy.version} · ` : ''}시행일{' '}
                {policyDate(policy.updated_at)}
              </p>
            )}
          </header>
          {policy.archived && (
            <p className="policy-view__notice" role="note">
              이전 버전이에요. 지금 시행 중인 문서는{' '}
              <a className="policy-view__link" href="?">
                여기
              </a>
              에서 볼 수 있어요.
            </p>
          )}
          <div className="policy-view__body">
            {policyParagraphs(policy.body).map((paragraph, index) => (
              <p className="policy-view__paragraph" key={index}>
                {paragraph}
              </p>
            ))}
          </div>
          {history.length > 0 && (
            <nav className="policy-view__history" aria-label="이전 버전">
              <h3 className="policy-view__history-title">이전 버전</h3>
              <ul className="policy-view__history-list">
                {history.map((item) => (
                  <li key={item.version}>
                    <a
                      className="policy-view__link"
                      href={`?v=${item.version}`}
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
      </div>
    </section>
  )
}
