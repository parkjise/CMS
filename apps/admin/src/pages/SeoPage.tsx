import { ReadOnlyFieldset } from '@/components/layout/ReadOnlyFieldset'
import { useLayoutEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  BarChart3,
  Globe,
  Image as ImageIcon,
  Lock,
  Map,
  Search,
} from 'lucide-react'
import { Input, Textarea, toast } from '@cms/ui'
import { CharCounter } from '@/components/content/forms/CharCounter'
import { FormField } from '@/components/content/forms/FormField'
import { ImageUploadField } from '@/components/content/forms/ImageUploadField'
import { GoogleSnippetPreview } from '@/components/seo/GoogleSnippetPreview'
import { KeywordTagInput } from '@/components/seo/KeywordTagInput'
import { SearchConsoleGuideModal } from '@/components/seo/SearchConsoleGuideModal'
import { SitemapCheck } from '@/components/seo/SitemapCheck'
import { SocialPreview } from '@/components/seo/SocialPreview'
import { SaveBar } from '@/components/site/SaveBar'
import { SitePage } from '@/components/site/SitePage'
import { useDomainStatus } from '@/hooks/useDomain'
import { useLeaveGuard } from '@/hooks/useLeaveGuard'
import { useGeo } from '@/hooks/useSearchSettings'
import {
  type SeoSettings,
  type SeoSettingsUpdate,
  useSeoLimits,
  useSeoSettings,
  useUpdateSeo,
} from '@/hooks/useSeo'
import { useAuthStore } from '@/stores/authStore'
import { pickErrorMessage } from '@/lib/errorMessages'
import { composeRobotsTxt } from '@/lib/robotsPreview'

type Tab = 'basic' | 'social' | 'sitemap' | 'analytics'

const TITLE_MAX = 60
const DESC_MAX = 160
const OG_TITLE_MAX = 60
const OG_DESC_MAX = 200
const CLIENT_BASE_URL = import.meta.env.VITE_CLIENT_BASE_URL ?? 'http://localhost:3000'

/** 화면에서 고치는 값 — 탭을 옮겨도 남고, 저장 막대 하나로 한꺼번에 저장한다 (T-225) */
interface Draft {
  metaTitle: string
  metaDescription: string
  keywords: string[]
  ogImage: string
  ogTitle: string
  ogDescription: string
  canonicalUrl: string
  robotsMeta: string
  robots: string
  gaId: string
  naverCode: string
  googleVerify: string
}

const toDraft = (d: SeoSettings | null | undefined): Draft => ({
  metaTitle: d?.meta_title ?? '',
  metaDescription: d?.meta_description ?? '',
  keywords: d?.keywords ?? [],
  ogImage: d?.og_image_url ?? '',
  ogTitle: d?.og_title ?? '',
  ogDescription: d?.og_description ?? '',
  canonicalUrl: d?.canonical_url ?? '',
  robotsMeta: d?.robots ?? 'index,follow',
  robots: d?.robots_txt ?? '',
  gaId: d?.google_analytics_id ?? '',
  naverCode: d?.naver_site_verification ?? '',
  googleVerify: d?.google_site_verification ?? '',
})

const sameDraft = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b)

export function SeoPage() {
  const seoQuery = useSeoSettings()
  const updateMutation = useUpdateSeo()
  const limitsQuery = useSeoLimits()
  const limits = limitsQuery.data
  const keywordsAllowed = limits?.keywords_allowed ?? false
  const tenantSlug = useAuthStore((s) => s.tenantSlug)
  const domain = useDomainStatus().data
  const geo = useGeo().data

  const [activeTab, setActiveTab] = useState<Tab>('basic')
  const [draft, setDraft] = useState<Draft>(() => toDraft(null))
  const [guideOpen, setGuideOpen] = useState(false)
  const saved = useMemo(() => toDraft(seoQuery.data), [seoQuery.data])
  const dirty = !seoQuery.isLoading && !sameDraft(draft, saved)
  useLeaveGuard(dirty)

  // 서버 응답 도착 시 폼 동기화 — 화면에 그리기 전에 채워 빈 폼이 한 번 보였다가
  // 높이가 바뀌며 밀리지 않게 (T-043-A)
  useLayoutEffect(() => {
    setDraft(saved)
  }, [saved])

  const patch = (change: Partial<Draft>) => setDraft((d) => ({ ...d, ...change }))
  const {
    metaTitle,
    metaDescription,
    keywords,
    ogImage,
    ogTitle,
    ogDescription,
    canonicalUrl,
    robotsMeta,
    robots,
    gaId,
    naverCode,
    googleVerify,
  } = draft

  // 연결한 도메인이 켜져 있으면 검색에 나오는 주소는 그쪽
  const customDomain = domain?.status === 'ACTIVE' ? domain.domain : null
  const homeBase = `${CLIENT_BASE_URL}/${tenantSlug ?? 'sample'}`
  const siteUrl = canonicalUrl.trim() || (customDomain ? `https://${customDomain}` : homeBase)
  // 관리자가 읽어 오는 사이트맵은 늘 기본 주소 — 실제로 쓰이는 사이트맵 (예전 백엔드 주소 아님)
  const sitemapFetchUrl = `${homeBase}/sitemap.xml`
  const sitemapUrl = customDomain ? `https://${customDomain}/sitemap.xml` : sitemapFetchUrl
  const robotsPreview = useMemo(() => {
    const custom = robots.trim()
    const base = custom
      ? `${custom}\n`
      : `User-Agent: *\nAllow: /\n\nSitemap: https://${customDomain ?? '내-도메인'}/sitemap.xml\n`
    return composeRobotsTxt(base, geo?.settings?.crawlers ?? {})
  }, [robots, customDomain, geo])

  const overLimit =
    metaTitle.length > TITLE_MAX ||
    metaDescription.length > DESC_MAX ||
    ogTitle.length > OG_TITLE_MAX ||
    ogDescription.length > OG_DESC_MAX

  const handleSave = () => {
    const payload: SeoSettingsUpdate = {
      meta_title: metaTitle || null,
      meta_description: metaDescription || null,
      og_image_url: ogImage || null,
      og_title: ogTitle || null,
      og_description: ogDescription || null,
      robots: robotsMeta,
      canonical_url: canonicalUrl || null,
      robots_txt: robots || null,
      google_analytics_id: gaId || null,
      naver_site_verification: naverCode || null,
      google_site_verification: googleVerify || null,
      // 잠긴 요금제는 키워드를 보내지 않는다 (저장된 값은 그대로)
      ...(keywordsAllowed ? { keywords } : {}),
    }
    updateMutation.mutate(payload, {
      onSuccess: () => toast.success('SEO 설정을 저장했습니다. 홈페이지에 바로 반영돼요.'),
      onError: (e) => toast.error(pickErrorMessage(e, '저장에 실패했습니다.')),
    })
  }

  return (
    <SitePage
      title="SEO 설정"
      description="검색 결과와 소셜 공유에 보이는 정보, 검색엔진 수집 · 사이트맵을 설정합니다. 탭을 옮겨도 고친 내용은 남고, 아래 [변경사항 저장]으로 한꺼번에 저장해요."
    >
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex flex-wrap gap-6">
          <TabBtn
            active={activeTab === 'basic'}
            icon={Search}
            label="기본 SEO"
            onClick={() => setActiveTab('basic')}
          />
          <TabBtn
            active={activeTab === 'social'}
            icon={ImageIcon}
            label="소셜 미리보기"
            onClick={() => setActiveTab('social')}
          />
          <TabBtn
            active={activeTab === 'sitemap'}
            icon={Map}
            label="사이트맵"
            onClick={() => setActiveTab('sitemap')}
          />
          <TabBtn
            active={activeTab === 'analytics'}
            icon={BarChart3}
            label="분석 연동"
            onClick={() => setActiveTab('analytics')}
          />
        </nav>
      </div>

      {/* key 를 달리해 불러오는 자리 노드가 본문으로 재사용되지 않게 — 재사용되면
          브라우저가 '요소가 움직였다'(CLS)로 센다 (T-043-A) */}
      {seoQuery.isLoading || limitsQuery.isLoading ? (
        <div key="seo-loading" className="h-96 animate-pulse rounded-lg bg-slate-100" />
      ) : (
        <div key="seo-ready" className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <ReadOnlyFieldset className="min-w-0 space-y-6 lg:col-span-2">
            {activeTab === 'basic' && (
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                <FormField
                  label="메타 제목 (Title)"
                  hint="검색 결과 상단에 노출되는 페이지 제목. 50~60자 권장."
                  trailing={
                    <CharCounter current={metaTitle.length} max={TITLE_MAX} />
                  }
                >
                  <Input
                    value={metaTitle}
                    onChange={(e) => patch({ metaTitle: e.target.value })}
                    placeholder="강남 통증의학과 OO의원 - 비수술 관절·척추 치료"
                  />
                </FormField>

                <div className="mt-5">
                  <FormField
                    label="메타 설명 (Description)"
                    hint="검색 결과에 본문 아래로 노출되는 짧은 설명. 150~160자 권장."
                    trailing={
                      <CharCounter
                        current={metaDescription.length}
                        max={DESC_MAX}
                      />
                    }
                  >
                    <Textarea
                      value={metaDescription}
                      onChange={(e) => patch({ metaDescription: e.target.value })}
                      placeholder="강남역 2번 출구 도보 3분..."
                      rows={3}
                    />
                  </FormField>
                </div>

                <div className="mt-5 space-y-1.5">
                  <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    대표 키워드
                    {limits && !keywordsAllowed && (
                      <Lock className="h-3.5 w-3.5 text-slate-400" aria-label="잠김" />
                    )}
                  </label>
                  <KeywordTagInput
                    keywords={keywords}
                    onChange={(next) => patch({ keywords: next })}
                    max={limits?.keywords_max ?? 5}
                    maxLength={limits?.keyword_max_length ?? 30}
                    disabled={!keywordsAllowed}
                  />
                  {limits && !keywordsAllowed ? (
                    <p className="text-xs text-slate-500">
                      🔒 대표 키워드는 STANDARD 이상 요금제에서 저장할 수 있어요.{' '}
                      <Link to="/admin/billing" className="font-medium text-blue-600 hover:underline">
                        요금제 보기
                      </Link>
                      <br />
                      지금은 페이지 제목과 설명에 지역 · 업종 단어를 자연스럽게 넣는 것이 검색에
                      가장 효과적이에요.
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500">
                      💡 검색엔진용 구조화 데이터와 AI 문구 추천에 쓰여요. 검색 순위에는 제목 ·
                      설명 · 본문에 들어간 단어가 더 중요합니다.
                    </p>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'social' && (
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                <ImageUploadField
                  label="OG 이미지 (소셜 공유 이미지)"
                  value={ogImage}
                  onChange={(next) => patch({ ogImage: next })}
                  context="seo"
                  hint="카카오톡 · 페이스북에 링크를 공유할 때 보이는 그림입니다. 1200×630 권장."
                />
                <div className="mt-4">
                  <FormField
                    label="소셜 공유 제목"
                    htmlFor="seo-og-title"
                    hint="비워 두면 [기본 SEO] 의 페이지 제목을 씁니다."
                    trailing={<CharCounter current={ogTitle.length} max={OG_TITLE_MAX} />}
                  >
                    <Input
                      id="seo-og-title"
                      value={ogTitle}
                      onChange={(e) => patch({ ogTitle: e.target.value })}
                    />
                  </FormField>
                </div>
                <div className="mt-4">
                  <FormField
                    label="소셜 공유 설명"
                    htmlFor="seo-og-description"
                    hint="비워 두면 [기본 SEO] 의 메타 설명을 씁니다."
                    trailing={<CharCounter current={ogDescription.length} max={OG_DESC_MAX} />}
                  >
                    <Textarea
                      id="seo-og-description"
                      value={ogDescription}
                      onChange={(e) => patch({ ogDescription: e.target.value })}
                      rows={3}
                    />
                  </FormField>
                </div>
              </div>
            )}

            {activeTab === 'sitemap' && (
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                <FormField label="공개 사이트맵 URL">
                  <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    <Globe className="h-3.5 w-3.5 text-slate-400" />
                    <code className="flex-1 truncate">{sitemapUrl}</code>
                  </div>
                </FormField>
                <p className="mt-1 text-xs text-slate-500">
                  사이트맵은 홈페이지가 자동으로 만들어요. 네이버 서치어드바이저 · 구글 서치 콘솔에 이
                  주소를 등록하세요.
                </p>

                <div className="mt-4">
                  <SitemapCheck
                    fetchUrl={sitemapFetchUrl}
                    base={homeBase}
                    customDomain={customDomain}
                  />
                </div>

                <div className="mt-5">
                  <FormField
                    label="검색 노출"
                    htmlFor="seo-robots"
                    hint="숨기면 네이버 · 구글 검색 결과에 나오지 않습니다."
                  >
                    <select
                      id="seo-robots"
                      value={robotsMeta}
                      onChange={(e) => patch({ robotsMeta: e.target.value })}
                      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
                    >
                      <option value="index,follow">검색에 노출 (기본)</option>
                      <option value="noindex,follow">이 사이트는 숨기고 링크만 따라가기</option>
                      <option value="index,nofollow">노출하되 링크는 따라가지 않기</option>
                      <option value="noindex,nofollow">검색에서 완전히 숨기기</option>
                    </select>
                  </FormField>
                </div>

                <div className="mt-5">
                  <FormField
                    label="대표 주소 (canonical)"
                    htmlFor="seo-canonical"
                    hint="연결한 도메인처럼 검색에 나오길 바라는 주소. 비워 두면 넣지 않습니다."
                  >
                    <Input
                      id="seo-canonical"
                      type="url"
                      value={canonicalUrl}
                      onChange={(e) => patch({ canonicalUrl: e.target.value })}
                      placeholder="https://my-hospital.com"
                    />
                  </FormField>
                </div>

                <div className="mt-5">
                  <FormField
                    label="robots.txt"
                    hint="검색 엔진 크롤러 동작을 제어합니다. 비워두면 기본값 (전체 허용)."
                  >
                    <Textarea
                      value={robots}
                      onChange={(e) => patch({ robots: e.target.value })}
                      placeholder={'User-agent: *\nAllow: /\nSitemap: ' + sitemapUrl}
                      rows={5}
                    />
                  </FormField>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-slate-600">
                      규칙 보기
                    </summary>
                    <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-slate-900 p-3 text-xs text-slate-100">
                      {robotsPreview}
                    </pre>
                    <p className="mt-1 text-xs text-slate-500">
                      연결한 도메인에서 실제로 나가는 robots.txt 예요. AI 크롤러 규칙은{' '}
                      <Link to="/admin/site/geo" className="font-medium text-blue-600 hover:underline">
                        GEO 설정
                      </Link>
                      에서 더해요.
                    </p>
                  </details>
                </div>
              </div>
            )}

            {activeTab === 'analytics' && (
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-800">
                    검색엔진 연동 · 사이트 인증
                  </h3>
                  <button
                    type="button"
                    onClick={() => setGuideOpen(true)}
                    className="text-xs font-medium text-blue-600 hover:underline"
                  >
                    등록 가이드 보기
                  </button>
                </div>

                <FormField
                  label="Google Analytics ID"
                  hint="GA4 측정 ID (예: G-XXXXXXXXXX)"
                >
                  <Input
                    value={gaId}
                    onChange={(e) => patch({ gaId: e.target.value })}
                    placeholder="G-XXXXXXXXXX"
                  />
                </FormField>

                <div className="mt-5">
                  <FormField
                    label="Google 사이트 인증 코드"
                    hint="서치 콘솔 HTML 태그의 content 값 (google-site-verification)"
                  >
                    <Input
                      value={googleVerify}
                      onChange={(e) => patch({ googleVerify: e.target.value })}
                      placeholder="google-site-verification 코드"
                    />
                  </FormField>
                </div>

                <div className="mt-5">
                  <FormField
                    label="네이버 사이트 검증 코드"
                    hint="네이버 서치어드바이저에서 발급받은 메타 태그 값"
                  >
                    <Input
                      value={naverCode}
                      onChange={(e) => patch({ naverCode: e.target.value })}
                      placeholder="abc123..."
                    />
                  </FormField>
                </div>
              </div>
            )}
          </ReadOnlyFieldset>

          {/* 우측 사이드: 미리보기 */}
          <aside className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-700">실시간 미리보기</h2>
            {activeTab === 'social' ? (
              <SocialPreview
                title={ogTitle || metaTitle}
                description={ogDescription || metaDescription}
                url={siteUrl}
                imageUrl={ogImage}
              />
            ) : (
              <GoogleSnippetPreview
                title={metaTitle}
                description={metaDescription}
                url={siteUrl}
                hidden={robotsMeta.startsWith('noindex')}
                titleMax={TITLE_MAX}
                descriptionMax={DESC_MAX}
              />
            )}
          </aside>
        </div>
      )}

      <SaveBar
        dirty={dirty}
        saving={updateMutation.isPending}
        onReset={() => setDraft(saved)}
        onSave={handleSave}
        error={overLimit ? '글자 수 제한을 넘은 칸이 있어요. 줄인 뒤 저장해 주세요.' : undefined}
      />

      <SearchConsoleGuideModal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
      />
    </SitePage>
  )
}

interface TabBtnProps {
  active: boolean
  icon: typeof Search
  label: string
  onClick: () => void
}

function TabBtn({ active, icon: Icon, label, onClick }: TabBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition ${
        active
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}
