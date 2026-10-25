import { buildCssVarBody } from '@/lib/theme'
import type { PublicSite } from '@/lib/publicSite.types'
import type { CodeTemplateEntry } from './shared/contracts'
import { resolvePageSections, resolveSiteInfo } from './shared/resolveSections'

interface Props {
  entry: CodeTemplateEntry
  site: PublicSite
  tenantSlug: string
  pageKey: string
  preview?: boolean
  /**
   * 'tenant'(기본): 테넌트 콘텐츠 + 빈 값만 샘플 / 'sample': 템플릿 샘플 그대로 (디자인 원본 확인용 미리보기)
   */
  contentSource?: 'tenant' | 'sample'
  /** 미리보기 안에서 페이지 이동 링크를 유지하기 위한 쿼리 ('tpl=…&content=…') */
  previewQuery?: string
}

/**
 * 코드형 템플릿 렌더링 (서버 컴포넌트).
 * - 페이지 루트에 data-template 을 달아 템플릿 스타일 범위를 제한한다 (기획서 11.7 스타일 격리)
 * - 실제 적용 중인 템플릿이면 테넌트 CSS 변수(색상 커스터마이징)를 템플릿 루트에 덮어쓴다.
 *   미리보기에서는 템플릿 기본 토큰을 그대로 보여준다.
 */
export async function CodeTemplateRenderer({
  entry,
  site,
  tenantSlug,
  pageKey,
  preview = false,
  contentSource = 'tenant',
  previewQuery,
}: Props) {
  const { default: Template } = await entry.load()
  const useSample = contentSource === 'sample'
  const sections = resolvePageSections(
    entry.manifest,
    entry.sample,
    useSample ? [] : site.sections,
    pageKey,
  )
  const siteInfo = useSample ? { ...entry.sample.site } : resolveSiteInfo(entry.sample, site)
  const overrideBody = preview ? '' : buildCssVarBody(site.template?.css_variables)

  return (
    <div data-template={entry.manifest.key} data-template-version={entry.manifest.version}>
      {overrideBody && (
        <style
          dangerouslySetInnerHTML={{
            __html: `[data-template='${entry.manifest.key}'] { ${overrideBody} }`,
          }}
        />
      )}
      <Template
        site={site}
        tenantSlug={tenantSlug}
        pageKey={pageKey}
        sections={sections}
        siteInfo={siteInfo}
        preview={preview}
        previewQuery={previewQuery}
      />
    </div>
  )
}
