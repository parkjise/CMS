import { type SitePolicy, policyDate, policyParagraphs } from '@/lib/sitePolicy'

/** 이용약관 · 개인정보처리방침 본문 — hospital-a (T-200) */
export function PolicyView({ policy }: { policy: SitePolicy }) {
  return (
    <section className="policy-view" aria-labelledby="policy-view-title">
      <div className="page-container">
        <article className="policy-view__article">
          <header className="policy-view__head">
            <h2 className="policy-view__title" id="policy-view-title">
              {policy.title}
            </h2>
            {policy.updated_at && (
              <p className="policy-view__date">시행일 {policyDate(policy.updated_at)}</p>
            )}
          </header>
          <div className="policy-view__body">
            {policyParagraphs(policy.body).map((paragraph, index) => (
              <p className="policy-view__paragraph" key={index}>
                {paragraph}
              </p>
            ))}
          </div>
        </article>
      </div>
    </section>
  )
}
