'use client'

import { EditableButton } from '@/components/edit/EditableButton'
import { EditableText } from '@/components/edit/EditableText'
import { HeroBgImageEditor } from '@/components/edit/HeroBgImageEditor'
import { useEditStore } from '@/lib/editStore'
import { getString, getValueType } from '@/lib/sectionSettings'
import type { SectionProps } from './types'

export function HeroBanner({ section }: SectionProps) {
  const mainTitle = getString(section.settings, 'main_title')
  const subCopy = getString(section.settings, 'sub_copy')
  const bgImage = getString(section.settings, 'bg_image_url')
  const ctaText = getString(section.settings, 'cta_text')
  const ctaUrl = getString(section.settings, 'cta_url')

  const pending = useEditStore(
    (s) => s.pendingChanges[`${section.id}:bg_image_url`],
  )
  const currentBgImage = pending?.new_value ?? bgImage

  return (
    <section
      data-section-id={section.id}
      data-section-type="HERO_BANNER"
      className="relative flex min-h-[60vh] items-center justify-center bg-[var(--color-primary)] px-6 py-24 text-center md:min-h-[80vh]"
      style={
        currentBgImage
          ? {
              backgroundImage: `linear-gradient(var(--color-overlay), var(--color-overlay)), url(${currentBgImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : undefined
      }
    >
      <HeroBgImageEditor
        sectionId={section.id}
        field="bg_image_url"
        initialUrl={bgImage}
      />

      <div className="max-w-3xl">
        {mainTitle && (
          <EditableText
            as="h1"
            sectionId={section.id}
            field="main_title"
            valueType={getValueType(section.settings, 'main_title')}
            formatting
            initialValue={mainTitle}
            maxLength={40}
            className="text-3xl font-bold leading-tight text-[color:var(--color-on-primary)] md:text-5xl"
          />
        )}
        {subCopy && (
          <div className="mt-4">
            <EditableText
              as="p"
              sectionId={section.id}
              field="sub_copy"
            valueType={getValueType(section.settings, 'sub_copy')}
            formatting
              initialValue={subCopy}
              maxLength={80}
              className="text-base text-[color:var(--color-on-primary)]/90 md:text-lg"
            />
          </div>
        )}
        {/* 편집 모드에서는 버튼을 누르면 문구 · 링크 편집 팝업 (T-065-B) */}
        <EditableButton
          sectionId={section.id}
          textField="cta_text"
          urlField="cta_url"
          initialText={ctaText}
          initialUrl={ctaUrl}
          maxLength={20}
          className="mt-8 inline-flex items-center rounded-[var(--border-radius-base)] bg-[var(--color-background)] px-6 py-3 text-sm font-medium text-[color:var(--color-text-primary)] transition hover:bg-[var(--color-surface-strong)]"
        />
      </div>
    </section>
  )
}
