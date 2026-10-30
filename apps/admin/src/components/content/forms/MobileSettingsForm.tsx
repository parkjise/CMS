import { useState } from 'react'
import { Smartphone } from 'lucide-react'
import { Toggle } from '@cms/ui'
import { ImageUploadField } from './ImageUploadField'
import { SaveBar } from './HeroBannerForm'
import { getSetting, strSetting, urlSetting } from './utils'
import type { SectionFormProps } from './types'

/** 큰 배경 사진 1장을 쓰는 섹션 — 휴대폰용 사진을 따로 받는다 (T-037-D) */
const MOBILE_IMAGE_TYPES = new Set(['HERO_BANNER', 'SUB_HERO'])

const supportsMobileImage = (section: SectionFormProps['section']): boolean =>
  MOBILE_IMAGE_TYPES.has(section.section_type) ||
  section.settings.some((s) => s.field_key === 'bg_image_url')

/**
 * 섹션 편집 → 모바일 설정 탭 (기획서 AD-02-B, T-037-D)
 * - 휴대폰(767px 이하)에서 숨기기 — PC 화면 · 상단 메뉴(PC)에는 그대로
 * - 휴대폰용 배경 이미지 — 가로 사진이 휴대폰에서 잘리지 않게
 */
export function MobileSettingsForm({ section, isSaving, onSubmit }: SectionFormProps) {
  const [hidden, setHidden] = useState(getSetting(section.settings, 'mobile_hidden') === 'true')
  const [mobileImage, setMobileImage] = useState(getSetting(section.settings, 'mobile_image_url'))
  const withImage = supportsMobileImage(section)

  const handleSave = async () => {
    await onSubmit([
      strSetting('mobile_hidden', hidden ? 'true' : 'false'),
      ...(withImage ? [urlSetting('mobile_image_url', mobileImage)] : []),
    ])
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        handleSave()
      }}
    >
      <div className="flex items-start gap-3 rounded-md border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
        <Smartphone className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
        <p>
          휴대폰(화면 폭 767px 이하)에서만 적용돼요. PC 화면은 그대로이고, 홈페이지 편집 모드에서는 숨긴
          섹션도 보입니다.
        </p>
      </div>

      <Toggle
        label="휴대폰에서 숨기기"
        description="긴 소개 · 갤러리처럼 휴대폰에서 너무 길어지는 섹션을 PC에서만 보여 줘요. 휴대폰 메뉴에서도 빠집니다."
        checked={hidden}
        onChange={(e) => setHidden(e.target.checked)}
      />

      {withImage && (
        <ImageUploadField
          label="휴대폰용 배경 이미지"
          context="hero"
          sectionId={section.id}
          value={mobileImage}
          onChange={setMobileImage}
          hint="세로로 긴 사진(예: 1080×1350)을 권장해요. 비워 두면 PC 사진을 그대로 씁니다."
        />
      )}

      <SaveBar isSaving={isSaving} />
    </form>
  )
}
