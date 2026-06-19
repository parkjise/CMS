'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { publicApi } from '@/lib/api'
import { getBoolean, getString } from '@/lib/sectionSettings'
import type { SectionProps } from './types'

const PHONE_RE = /^01[016789]-?\d{3,4}-?\d{4}$/
const MESSAGE_MIN = 10
const MESSAGE_MAX = 1000

interface FormState {
  name: string
  phone: string
  email: string
  message: string
}

const INITIAL: FormState = { name: '', phone: '', email: '', message: '' }

const INPUT_CLASS =
  'w-full rounded-[var(--border-radius-base)] border border-[color:var(--color-border-strong)] bg-[var(--color-background)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] focus:border-[color:var(--color-primary)] focus:outline-none'

export function ContactForm({ section, tenantSlug }: SectionProps) {
  const title = getString(section.settings, 'section_title', '문의하기')
  const description = getString(section.settings, 'description')
  const requirePhone = getBoolean(section.settings, 'require_phone', true)
  const requireEmail = getBoolean(section.settings, 'require_email', false)

  const [form, setForm] = useState<FormState>(INITIAL)
  const [submitting, setSubmitting] = useState(false)

  const update = (patch: Partial<FormState>) =>
    setForm((prev) => ({ ...prev, ...patch }))

  const validate = (): string | null => {
    if (!form.name.trim()) return '이름을 입력해주세요.'
    if (requirePhone && !PHONE_RE.test(form.phone))
      return '올바른 휴대폰 번호를 입력해주세요. (예: 010-1234-5678)'
    if (requireEmail && !form.email.trim())
      return '이메일을 입력해주세요.'
    if (form.message.trim().length < MESSAGE_MIN)
      return `문의 내용은 ${MESSAGE_MIN}자 이상 입력해주세요.`
    if (form.message.length > MESSAGE_MAX)
      return `문의 내용은 ${MESSAGE_MAX}자 이하로 입력해주세요.`
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const error = validate()
    if (error) {
      toast.error(error)
      return
    }
    setSubmitting(true)
    try {
      await publicApi.post(
        '/inquiries',
        {
          inquiry_type: 'GENERAL',
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
          message: form.message.trim(),
        },
        { params: { tenant_slug: tenantSlug } },
      )
      toast.success('문의가 접수되었습니다. 빠른 시일 내 연락드리겠습니다.')
      setForm(INITIAL)
    } catch {
      toast.error('문의 접수 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section
      data-section-id={section.id}
      data-section-type="CONTACT"
      className="bg-[var(--color-surface)] px-6 py-16 md:py-24"
    >
      <div className="mx-auto max-w-2xl">
        <h2
          data-editable
          data-field="section_title"
          data-section-id={section.id}
          className="text-2xl font-bold text-[color:var(--color-text-primary)] md:text-3xl"
        >
          {title}
        </h2>
        {description && (
          <p
            data-editable
            data-field="description"
            data-section-id={section.id}
            className="mt-3 whitespace-pre-line text-sm text-[color:var(--color-text-muted)]"
          >
            {description}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <Field label="이름" required>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update({ name: e.target.value })}
              className={INPUT_CLASS}
              maxLength={100}
            />
          </Field>

          {requirePhone && (
            <Field label="휴대폰 번호" required>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => update({ phone: e.target.value })}
                placeholder="010-1234-5678"
                className={INPUT_CLASS}
              />
            </Field>
          )}

          <Field label="이메일" required={requireEmail}>
            <input
              type="email"
              value={form.email}
              onChange={(e) => update({ email: e.target.value })}
              className={INPUT_CLASS}
            />
          </Field>

          <Field
            label="문의 내용"
            required
            hint={`${form.message.length} / ${MESSAGE_MAX}자`}
          >
            <textarea
              value={form.message}
              onChange={(e) => update({ message: e.target.value })}
              rows={5}
              maxLength={MESSAGE_MAX}
              className={INPUT_CLASS}
            />
          </Field>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-[var(--border-radius-base)] bg-[var(--color-primary)] px-4 py-3 text-sm font-medium text-[color:var(--color-on-primary)] transition hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? '전송 중...' : '문의 보내기'}
          </button>
        </form>
      </div>
    </section>
  )
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-sm font-medium text-[color:var(--color-text-secondary)]">
        <span>
          {label}
          {required && (
            <span className="ml-1 text-[color:var(--color-danger)]">*</span>
          )}
        </span>
        {hint && (
          <span className="text-xs text-[color:var(--color-text-subtle)]">
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  )
}
