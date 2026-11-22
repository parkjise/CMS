import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Plus, TriangleAlert, X } from 'lucide-react'
import type { CrawlerPolicy, GeoEvidence, GeoSettings } from '@cms/types'
import { Button, Input, Textarea, toast } from '@cms/ui'
import { FormField } from '@/components/content/forms/FormField'
import { ReadOnlyFieldset } from '@/components/layout/ReadOnlyFieldset'
import { LeaveGuard } from '@/components/site/LeaveGuard'
import { SaveBar } from '@/components/site/SaveBar'
import { SITE_CARD, SitePage } from '@/components/site/SitePage'
import { useGeo, useUpdateGeo } from '@/hooks/useSearchSettings'
import { useSeoSettings } from '@/hooks/useSeo'
import { pickErrorMessage } from '@/lib/errorMessages'
import { composeRobotsTxt, mentionsAgent } from '@/lib/robotsPreview'

const DESCRIPTION_MAX = 500
const TOPICS_MAX = 10
const PROFILES_MAX = 10
const EVIDENCE_MAX = 20
// 출처를 다시 확인할 때 — 1년이 지나면 안내
const STALE_DAYS = 365
const DEFAULT_ROBOTS = 'User-Agent: *\nAllow: /\n\nSitemap: https://내-도메인/sitemap.xml\n'
const POLICY_LABEL: Record<CrawlerPolicy, string> = {
  keep: '기존 정책 유지',
  allow: '허용',
  block: '차단',
}
const ICON_BUTTON = 'rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700'
const SELECT =
  'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:border-blue-500 focus:outline-none'

interface Draft {
  description: string
  topics: string
  profile_urls: string[]
  evidence: GeoEvidence[]
  crawlers: Record<string, CrawlerPolicy>
}

const toDraft = (s: GeoSettings): Draft => ({
  description: s.description,
  topics: s.topics.join(', '),
  profile_urls: s.profile_urls,
  evidence: s.evidence,
  crawlers: s.crawlers,
})

/** 저장할 값 — 빈 칸 · 기존 유지는 뺀다 */
const toSettings = (d: Draft): GeoSettings => ({
  description: d.description.trim(),
  topics: d.topics
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean),
  profile_urls: d.profile_urls.map((u) => u.trim()).filter(Boolean),
  evidence: d.evidence.map((e) => ({ ...e, claim: e.claim.trim(), url: e.url.trim() })),
  crawlers: Object.fromEntries(Object.entries(d.crawlers).filter(([, p]) => p !== 'keep')),
})

const isStale = (checkedAt: string | null): boolean =>
  checkedAt !== null && Date.now() - new Date(checkedAt).getTime() > STALE_DAYS * 86_400_000

/** 사이트 관리 → GEO 설정 (T-221, SM-06) — 공식 정보 · 출처 · AI 크롤러 정책 */
export function GeoPage() {
  const query = useGeo()
  const seo = useSeoSettings()
  const save = useUpdateGeo()
  const [draft, setDraft] = useState<Draft | null>(null)

  useEffect(() => {
    if (query.data) setDraft(toDraft(query.data.settings))
  }, [query.data])

  const dirty = Boolean(
    draft &&
    query.data &&
    JSON.stringify(toSettings(draft)) !== JSON.stringify(toSettings(toDraft(query.data.settings)))
  )

  const customRobots = seo.data?.robots_txt?.trim() ?? ''
  const robotsBase = customRobots ? `${customRobots}\n` : DEFAULT_ROBOTS
  const preview = useMemo(
    () => (draft ? composeRobotsTxt(robotsBase, draft.crawlers) : robotsBase),
    [draft, robotsBase]
  )

  if (query.isError) {
    return (
      <SitePage title="GEO 설정" description="">
        <p className="text-sm text-red-600">GEO 설정을 불러오지 못했습니다.</p>
      </SitePage>
    )
  }

  const patch = (change: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...change } : d))
  const setEvidence = (index: number, change: Partial<GeoEvidence>) =>
    draft &&
    patch({ evidence: draft.evidence.map((e, i) => (i === index ? { ...e, ...change } : e)) })
  const topicCount = draft ? toSettings(draft).topics.length : 0

  // 성공 여부를 돌려준다 — 나가기 확인의 [저장하고 이동] (T-227)
  const handleSave = async () => {
    if (!draft) return false
    try {
      await save.mutateAsync(toSettings(draft))
      toast.success('GEO 설정을 저장했습니다. 홈페이지에 바로 반영돼요.')
      return true
    } catch (error) {
      toast.error(pickErrorMessage(error, '저장하지 못했습니다.'))
      return false
    }
  }

  return (
    <SitePage
      title="GEO 설정"
      description="AI 검색 · 답변 서비스가 사업체를 정확히 소개하도록 공식 정보와 출처를 정리하고, AI 크롤러의 접근을 정해요."
    >
      {(query.isLoading || !draft || !query.data) && (
        <div className="h-96 animate-pulse rounded-lg bg-slate-100" />
      )}
      {draft && query.data && (
        <ReadOnlyFieldset className="min-w-0 space-y-6">
          <section className={SITE_CARD} aria-labelledby="geo-brand">
            <h2 id="geo-brand" className="text-base font-semibold text-slate-900">
              기업 · 브랜드 정보
            </h2>
            <p className="text-sm text-slate-500">
              공식 이름 · 주소 · 연락처는{' '}
              <Link to="/admin/site/info" className="text-blue-600 hover:underline">
                사이트 기본정보
              </Link>
              를, 공식 사이트 주소는{' '}
              <Link to="/admin/site/seo" className="text-blue-600 hover:underline">
                SEO 설정
              </Link>
              의 대표 주소({seo.data?.canonical_url || '미설정'})를 그대로 써요.
            </p>
            <FormField
              label="기업 소개"
              htmlFor="geo-description"
              hint={`사업 분야와 전문성을 사실 위주로 적어 주세요. ${draft.description.length} / ${DESCRIPTION_MAX}자`}
            >
              <Textarea
                id="geo-description"
                rows={4}
                maxLength={DESCRIPTION_MAX}
                value={draft.description}
                placeholder="예) 2010년 강남에서 문을 연 치과로, 임플란트와 교정을 전문으로 합니다."
                onChange={(e) => patch({ description: e.target.value })}
              />
            </FormField>
            <FormField
              label="서비스 · 주제 키워드"
              htmlFor="geo-topics"
              hint={`쉼표로 나눠 최대 ${TOPICS_MAX}개 · 지금 ${topicCount}개`}
            >
              <Input
                id="geo-topics"
                value={draft.topics}
                placeholder="임플란트, 치아 교정, 스케일링"
                error={topicCount > TOPICS_MAX ? `키워드는 ${TOPICS_MAX}개까지예요.` : undefined}
                onChange={(e) => patch({ topics: e.target.value })}
              />
            </FormField>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-slate-700">공식 프로필 주소</legend>
              <p className="text-xs text-slate-500">
                블로그 · 지도 · 플레이스처럼 사업체가 직접 운영하는 페이지예요. SNS 설정의 주소와
                함께 내보냅니다.
              </p>
              {draft.profile_urls.map((url, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Input
                      aria-label={`공식 프로필 주소 ${index + 1}`}
                      value={url}
                      placeholder="https://"
                      onChange={(e) =>
                        patch({
                          profile_urls: draft.profile_urls.map((u, i) =>
                            i === index ? e.target.value : u
                          ),
                        })
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className={ICON_BUTTON}
                    aria-label={`공식 프로필 주소 ${index + 1} 삭제`}
                    onClick={() =>
                      patch({ profile_urls: draft.profile_urls.filter((_, i) => i !== index) })
                    }
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ))}
              {draft.profile_urls.length < PROFILES_MAX && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => patch({ profile_urls: [...draft.profile_urls, ''] })}
                >
                  <Plus className="mr-1 h-4 w-4" aria-hidden />
                  주소 추가
                </Button>
              )}
            </fieldset>
          </section>

          <section className={SITE_CARD} aria-labelledby="geo-evidence">
            <h2 id="geo-evidence" className="text-base font-semibold text-slate-900">
              출처 · 근거 정보
            </h2>
            <p className="text-sm text-slate-500">
              소개에 쓴 내용의 근거가 되는 공식 페이지를 기록해 두는 관리용 목록이에요. 홈페이지에는
              나가지 않습니다.
            </p>
            {draft.evidence.length > 0 && (
              <ul className="space-y-3">
                {draft.evidence.map((item, index) => (
                  <li
                    key={index}
                    className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[1fr_1.4fr_10rem_auto] md:items-start"
                  >
                    <Input
                      aria-label={`주장 · 정보 ${index + 1}`}
                      value={item.claim}
                      maxLength={100}
                      placeholder="예) 임플란트 시술 3,000건"
                      onChange={(e) => setEvidence(index, { claim: e.target.value })}
                    />
                    <Input
                      aria-label={`출처 주소 ${index + 1}`}
                      value={item.url}
                      placeholder="https://"
                      onChange={(e) => setEvidence(index, { url: e.target.value })}
                    />
                    <div>
                      <Input
                        type="date"
                        aria-label={`최종 확인일 ${index + 1}`}
                        value={item.checked_at ?? ''}
                        onChange={(e) => setEvidence(index, { checked_at: e.target.value || null })}
                      />
                      {isStale(item.checked_at) && (
                        <p className="mt-1 text-xs text-amber-700">
                          1년이 지났어요. 다시 확인해 주세요.
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      className={ICON_BUTTON}
                      aria-label={`근거 정보 ${index + 1} 삭제`}
                      onClick={() =>
                        patch({ evidence: draft.evidence.filter((_, i) => i !== index) })
                      }
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {draft.evidence.length < EVIDENCE_MAX && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  patch({
                    evidence: [...draft.evidence, { claim: '', url: '', checked_at: null }],
                  })
                }
              >
                <Plus className="mr-1 h-4 w-4" aria-hidden />
                근거 정보 추가
              </Button>
            )}
          </section>

          <section className={SITE_CARD} aria-labelledby="geo-crawlers">
            <h2 id="geo-crawlers" className="text-base font-semibold text-slate-900">
              AI 크롤러 접근 정책
            </h2>
            <p className="text-sm text-slate-500">
              SEO 설정의 robots.txt 에 크롤러별 규칙을 더해요. 규칙을 지킬지는 각 회사에 달려
              있어서, 비공개로 지켜야 할 내용을 막는 수단으로는 쓰지 마세요.
            </p>
            <div className="divide-y divide-slate-100">
              {query.data.crawlers.map((crawler) => {
                const policy = draft.crawlers[crawler.name] ?? 'keep'
                const conflict = policy !== 'keep' && mentionsAgent(robotsBase, crawler.name)
                return (
                  <div
                    key={crawler.name}
                    className="grid gap-2 py-3 md:grid-cols-[1fr_12rem] md:items-center"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">{crawler.name}</p>
                      <p className="text-xs text-slate-500">{crawler.label}</p>
                      {conflict && (
                        <p
                          className="mt-1 flex items-start gap-1 text-xs text-amber-700"
                          role="note"
                        >
                          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                          SEO 설정의 robots.txt 에 이미 이 크롤러 규칙이 있어 그 규칙을 따라요.
                        </p>
                      )}
                    </div>
                    <select
                      aria-label={`${crawler.name} 접근 정책`}
                      className={SELECT}
                      value={policy}
                      onChange={(e) =>
                        patch({
                          crawlers: {
                            ...draft.crawlers,
                            [crawler.name]: e.target.value as CrawlerPolicy,
                          },
                        })
                      }
                    >
                      {(Object.keys(POLICY_LABEL) as CrawlerPolicy[]).map((value) => (
                        <option key={value} value={value}>
                          {POLICY_LABEL[value]}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">robots.txt 예상 결과</p>
              <pre
                aria-label="robots.txt 예상 결과"
                className="max-h-72 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100"
              >
                {preview}
              </pre>
              <p className="mt-1 text-xs text-slate-500">
                robots.txt 는 연결한 도메인(예: www.내병원.com)에서 적용돼요.
              </p>
            </div>
          </section>
        </ReadOnlyFieldset>
      )}
      <SaveBar
        dirty={dirty}
        saving={save.isPending}
        onReset={() => query.data && setDraft(toDraft(query.data.settings))}
        onSave={() => void handleSave()}
      />
      <LeaveGuard dirty={dirty} onSave={handleSave} />
    </SitePage>
  )
}
