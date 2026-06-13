import { useState } from 'react'
import { Toggle } from '@cms/ui'
import { Input, Textarea } from '@cms/ui'
import { FormField } from './FormField'
import { SaveBar } from './HeroBannerForm'
import { getSetting, strSetting } from './utils'
import type { SectionFormProps } from './types'

const TITLE_MAX = 40
const DESC_MAX = 160

const yes = (v: string) => v === 'true' || v === '1'

export function ContactForm({ section, isSaving, onSubmit }: SectionFormProps) {
  const [sectionTitle, setSectionTitle] = useState(
    getSetting(section.settings, 'section_title')
  )
  const [description, setDescription] = useState(
    getSetting(section.settings, 'description')
  )
  const [requirePhone, setRequirePhone] = useState(
    yes(getSetting(section.settings, 'require_phone', 'true'))
  )
  const [requireEmail, setRequireEmail] = useState(
    yes(getSetting(section.settings, 'require_email', 'false'))
  )
  const [allowAttachment, setAllowAttachment] = useState(
    yes(getSetting(section.settings, 'allow_attachment', 'false'))
  )

  const overLimit =
    sectionTitle.length > TITLE_MAX || description.length > DESC_MAX

  const handleSave = async () => {
    await onSubmit([
      strSetting('section_title', sectionTitle),
      strSetting('description', description),
      strSetting('require_phone', requirePhone ? 'true' : 'false'),
      strSetting('require_email', requireEmail ? 'true' : 'false'),
      strSetting('allow_attachment', allowAttachment ? 'true' : 'false'),
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
      <FormField label="섹션 제목">
        <Input
          value={sectionTitle}
          onChange={(e) => setSectionTitle(e.target.value)}
          placeholder="문의하기"
        />
      </FormField>

      <FormField label="안내 문구">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="궁금한 점이 있으시면 언제든 문의해주세요."
          rows={3}
        />
      </FormField>

      <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4">
        <div className="text-sm font-medium text-slate-700">필드 설정</div>
        <Toggle
          label="전화번호 필수"
          description="고객이 문의 시 전화번호를 반드시 입력해야 합니다."
          checked={requirePhone}
          onChange={(e) => setRequirePhone(e.target.checked)}
        />
        <Toggle
          label="이메일 필수"
          description="고객이 문의 시 이메일을 반드시 입력해야 합니다."
          checked={requireEmail}
          onChange={(e) => setRequireEmail(e.target.checked)}
        />
        <Toggle
          label="파일 첨부 허용"
          description="고객이 이미지·문서를 함께 보낼 수 있게 합니다."
          checked={allowAttachment}
          onChange={(e) => setAllowAttachment(e.target.checked)}
        />
      </div>

      <SaveBar isSaving={isSaving} disabled={overLimit} />
    </form>
  )
}
