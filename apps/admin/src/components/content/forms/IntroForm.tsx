import { useState } from 'react'
import { Textarea } from '@cms/ui'
import { CharCounter } from './CharCounter'
import { FormField } from './FormField'
import { ImageUrlField } from './ImageUrlField'
import { SaveBar } from './HeroBannerForm'
import { getSetting, strSetting, urlSetting } from './utils'
import type { SectionFormProps } from './types'

const INTRO_TEXT_MAX = 400

export function IntroForm({ section, isSaving, onSubmit }: SectionFormProps) {
  const [introText, setIntroText] = useState(
    getSetting(section.settings, 'intro_text')
  )
  const [introImage, setIntroImage] = useState(
    getSetting(section.settings, 'intro_image_url')
  )

  const overLimit = introText.length > INTRO_TEXT_MAX

  const handleSave = async () => {
    await onSubmit([
      strSetting('intro_text', introText),
      urlSetting('intro_image_url', introImage),
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
        label="소개 텍스트"
        trailing={<CharCounter current={introText.length} max={INTRO_TEXT_MAX} />}
      >
        <Textarea
          value={introText}
          onChange={(e) => setIntroText(e.target.value)}
          placeholder="고객에게 전달하고 싶은 소개 문구를 입력하세요."
          rows={6}
        />
      </FormField>

      <ImageUrlField label="소개 이미지" value={introImage} onChange={setIntroImage} />

      <SaveBar isSaving={isSaving} disabled={overLimit} />
    </form>
  )
}
