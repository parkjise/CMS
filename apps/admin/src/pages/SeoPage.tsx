import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  Globe,
  Image as ImageIcon,
  Map,
  Search,
} from 'lucide-react'
import { Button, Input, Textarea, toast } from '@cms/ui'
import { CharCounter } from '@/components/content/forms/CharCounter'
import { FormField } from '@/components/content/forms/FormField'
import { ImageUrlField } from '@/components/content/forms/ImageUrlField'
import { GoogleSnippetPreview } from '@/components/seo/GoogleSnippetPreview'
import { KeywordTagInput } from '@/components/seo/KeywordTagInput'
import { SocialPreview } from '@/components/seo/SocialPreview'
import { useSeoSettings, useUpdateSeo } from '@/hooks/useSeo'
import { useAuthStore } from '@/stores/authStore'

type Tab = 'basic' | 'social' | 'sitemap' | 'analytics'

const TITLE_MAX = 60
const DESC_MAX = 160

export function SeoPage() {
  const seoQuery = useSeoSettings()
  const updateMutation = useUpdateSeo()
  const tenantSlug = useAuthStore((s) => s.tenantSlug)

  const [activeTab, setActiveTab] = useState<Tab>('basic')
  const [metaTitle, setMetaTitle] = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  const [ogImage, setOgImage] = useState('')
  const [robots, setRobots] = useState('')
  const [gaId, setGaId] = useState('')
  const [naverCode, setNaverCode] = useState('')
  const [keywords, setKeywords] = useState<string[]>([])

  // 서버 응답 도착 시 폼 동기화
  useEffect(() => {
    if (!seoQuery.data) return
    const d = seoQuery.data
    setMetaTitle(d.meta_title ?? '')
    setMetaDescription(d.meta_description ?? '')
    setOgImage(d.og_image_url ?? '')
    setRobots(d.robots_txt ?? '')
    setGaId(d.google_analytics_id ?? '')
    setNaverCode(d.naver_site_verification ?? '')
  }, [seoQuery.data])

  const siteUrl = useMemo(() => {
    const base = window.location.origin.replace('localhost:3001', 'localhost:3000')
    return tenantSlug ? `${base}/${tenantSlug}` : `${base}/sample`
  }, [tenantSlug])

  const sitemapUrl = useMemo(() => {
    const apiBase = (
      import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api'
    ).replace(/\/api\/?$/, '/api')
    return tenantSlug
      ? `${apiBase}/public/sitemap/${tenantSlug}.xml`
      : `${apiBase}/public/sitemap/{tenant_slug}.xml`
  }, [tenantSlug])

  const overLimit =
    metaTitle.length > TITLE_MAX || metaDescription.length > DESC_MAX

  const save = async (
    label: string,
    payload: Parameters<typeof updateMutation.mutateAsync>[0]
  ) => {
    try {
      await updateMutation.mutateAsync(payload)
      toast.success(`${label} 설정을 저장했습니다.`)
    } catch (e) {
      const detail =
        (e as { response?: { data?: { detail?: unknown } } })?.response?.data
          ?.detail
      toast.error(typeof detail === 'string' ? detail : '저장에 실패했습니다.')
    }
  }

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">SEO 마법사</h1>
        <p className="mt-1 text-sm text-slate-500">
          검색 노출과 소셜 공유 시 보여지는 정보를 설정합니다.
        </p>
      </div>

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

      {seoQuery.isLoading ? (
        <div className="h-96 animate-pulse rounded-lg bg-slate-100" />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
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
                    onChange={(e) => setMetaTitle(e.target.value)}
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
                      onChange={(e) => setMetaDescription(e.target.value)}
                      placeholder="강남역 2번 출구 도보 3분..."
                      rows={3}
                    />
                  </FormField>
                </div>

                <div className="mt-5 space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">
                    핵심 키워드
                  </label>
                  <KeywordTagInput
                    keywords={keywords}
                    onChange={setKeywords}
                  />
                  <p className="text-xs text-amber-600">
                    💡 키워드는 자동 메타 태그로 저장되지 않습니다. Google은 이제
                    제목·설명·본문 키워드를 더 중요하게 봅니다.
                  </p>
                </div>

                <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
                  {overLimit && (
                    <span className="text-xs text-rose-600">
                      글자 수 제한을 확인해주세요.
                    </span>
                  )}
                  <Button
                    type="button"
                    onClick={() =>
                      save('기본 SEO', {
                        meta_title: metaTitle || null,
                        meta_description: metaDescription || null,
                      })
                    }
                    disabled={updateMutation.isPending || overLimit}
                  >
                    {updateMutation.isPending ? '저장 중...' : '기본 SEO 저장'}
                  </Button>
                </div>
              </div>
            )}

            {activeTab === 'social' && (
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                <ImageUrlField
                  label="OG 이미지 (소셜 공유 이미지)"
                  value={ogImage}
                  onChange={setOgImage}
                  hint="1200×630 권장. WebP/JPG/PNG 가능."
                />
                <p className="mt-3 text-xs text-slate-500">
                  메타 제목·설명은 [기본 SEO] 탭에서 입력한 값을 그대로 사용합니다.
                </p>
                <div className="mt-6 flex justify-end border-t border-slate-200 pt-4">
                  <Button
                    type="button"
                    onClick={() =>
                      save('소셜 미리보기', { og_image_url: ogImage || null })
                    }
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? '저장 중...' : 'OG 이미지 저장'}
                  </Button>
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
                  사이트맵은 자동으로 생성되며 활성 섹션 정보를 포함합니다. Google
                  Search Console에 이 URL을 등록하세요.
                </p>

                <div className="mt-5">
                  <FormField
                    label="robots.txt"
                    hint="검색 엔진 크롤러 동작을 제어합니다. 비워두면 기본값 (전체 허용)."
                  >
                    <Textarea
                      value={robots}
                      onChange={(e) => setRobots(e.target.value)}
                      placeholder={'User-agent: *\nAllow: /\nSitemap: ' + sitemapUrl}
                      rows={5}
                    />
                  </FormField>
                </div>

                <div className="mt-6 flex justify-end border-t border-slate-200 pt-4">
                  <Button
                    type="button"
                    onClick={() =>
                      save('사이트맵', { robots_txt: robots || null })
                    }
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? '저장 중...' : 'robots 저장'}
                  </Button>
                </div>
              </div>
            )}

            {activeTab === 'analytics' && (
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                <FormField
                  label="Google Analytics ID"
                  hint="GA4 측정 ID (예: G-XXXXXXXXXX)"
                >
                  <Input
                    value={gaId}
                    onChange={(e) => setGaId(e.target.value)}
                    placeholder="G-XXXXXXXXXX"
                  />
                </FormField>

                <div className="mt-5">
                  <FormField
                    label="네이버 사이트 검증 코드"
                    hint="네이버 서치어드바이저에서 발급받은 메타 태그 값"
                  >
                    <Input
                      value={naverCode}
                      onChange={(e) => setNaverCode(e.target.value)}
                      placeholder="abc123..."
                    />
                  </FormField>
                </div>

                <div className="mt-6 flex justify-end border-t border-slate-200 pt-4">
                  <Button
                    type="button"
                    onClick={() =>
                      save('분석 연동', {
                        google_analytics_id: gaId || null,
                        naver_site_verification: naverCode || null,
                      })
                    }
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? '저장 중...' : '분석 코드 저장'}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* 우측 사이드: 미리보기 */}
          <aside className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700">실시간 미리보기</h3>
            {activeTab === 'social' ? (
              <SocialPreview
                title={metaTitle}
                description={metaDescription}
                url={siteUrl}
                imageUrl={ogImage}
              />
            ) : (
              <GoogleSnippetPreview
                title={metaTitle}
                description={metaDescription}
                url={siteUrl}
              />
            )}
          </aside>
        </div>
      )}
    </div>
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
