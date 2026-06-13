import { useState } from 'react'
import { Button, Input } from '@cms/ui'
import { CharCounter } from './CharCounter'
import { FormField } from './FormField'
import { ImageUrlField } from './ImageUrlField'
import { getSetting, strSetting, urlSetting } from './utils'
import type { SectionFormProps } from './types'

const MAIN_TITLE_MAX = 40
const SUB_COPY_MAX = 80
const CTA_TEXT_MAX = 20

export function HeroBannerForm({ section, isSaving, onSubmit }: SectionFormProps) {
  const [mainTitle, setMainTitle] = useState(getSetting(section.settings, 'main_title'))
  const [subCopy, setSubCopy] = useState(getSetting(section.settings, 'sub_copy'))
  const [bgImage, setBgImage] = useState(getSetting(section.settings, 'bg_image_url'))
  const [ctaText, setCtaText] = useState(getSetting(section.settings, 'cta_text'))
  const [ctaUrl, setCtaUrl] = useState(getSetting(section.settings, 'cta_url'))

  const overLimit =
    mainTitle.length > MAIN_TITLE_MAX ||
    subCopy.length > SUB_COPY_MAX ||
    ctaText.length > CTA_TEXT_MAX

  const handleSave = async () => {
    await onSubmit([
      strSetting('main_title', mainTitle),
      strSetting('sub_copy', subCopy),
      urlSetting('bg_image_url', bgImage),
      strSetting('cta_text', ctaText),
      urlSetting('cta_url', ctaUrl),
    ])
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (!overLimit) handleSave()
      }}
    >
      <FormField
        label="메인 타이틀"
        trailing={<CharCounter current={mainTitle.length} max={MAIN_TITLE_MAX} />}
      >
        <Input
          value={mainTitle}
          onChange={(e) => setMainTitle(e.target.value)}
          placeholder="예: 강남 통증의학과 OO의원"
        />
      </FormField>

      <FormField
        label="서브 카피"
        trailing={<CharCounter current={subCopy.length} max={SUB_COPY_MAX} />}
      >
        <Input
          value={subCopy}
          onChange={(e) => setSubCopy(e.target.value)}
          placeholder="비수술 관절·척추 치료"
        />
      </FormField>

      <ImageUrlField
        label="배경 이미지"
        value={bgImage}
        onChange={setBgImage}
        hint="1920x1080 권장. WebP 자동 변환됩니다."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField
          label="CTA 버튼 문구"
          trailing={<CharCounter current={ctaText.length} max={CTA_TEXT_MAX} />}
        >
          <Input
            value={ctaText}
            onChange={(e) => setCtaText(e.target.value)}
            placeholder="문의하기"
          />
        </FormField>
        <FormField label="CTA 링크">
          <Input
            type="url"
            value={ctaUrl}
            onChange={(e) => setCtaUrl(e.target.value)}
            placeholder="https://..."
          />
        </FormField>
      </div>

      <SaveBar isSaving={isSaving} disabled={overLimit} />
    </form>
  )
}

// ── 공통 저장 바 (다른 폼에서도 쓸 수 있도록 export) ─────────────────────

export function SaveBar({
  isSaving,
  disabled,
}: {
  isSaving: boolean
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
      {disabled && (
        <span className="text-xs text-rose-600">
          글자 수 제한을 확인해주세요.
        </span>
      )}
      <Button type="submit" disabled={isSaving || disabled}>
        {isSaving ? '저장 중...' : '변경사항 저장'}
      </Button>
    </div>
  )
}
