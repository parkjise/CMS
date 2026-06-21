'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { publicApi } from '@/lib/api'
import { executeRecaptcha } from '@/lib/recaptcha'
import { getBoolean, getString } from '@/lib/sectionSettings'
import { EditableText } from '@/components/edit/EditableText'
import type { SectionProps } from './types'

const PHONE_RE = /^01[016789]-?\d{3,4}-?\d{4}$/
const MESSAGE_MIN = 10
const MESSAGE_MAX = 1000

const INQUIRY_TYPES = [
  { value: 'GENERAL', label: '일반 문의' },
  { value: 'RESERVATION', label: '예약 문의' },
  { value: 'SYMPTOM', label: '증상 문의' },
] as const

const INPUT_CLASS =
  'w-full rounded-[var(--border-radius-base)] border border-[color:var(--color-border-strong)] bg-[var(--color-background)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] focus:border-[color:var(--color-primary)] focus:outline-none'

interface SchemaContext {
  requirePhone: boolean
  requireEmail: boolean
}

function buildSchema({ requirePhone, requireEmail }: SchemaContext) {
  return z.object({
    inquiry_type: z.enum(['GENERAL', 'RESERVATION', 'SYMPTOM']),
    name: z.string().trim().min(1, '이름을 입력해주세요.').max(100),
    phone: requirePhone
      ? z
          .string()
          .trim()
          .regex(PHONE_RE, '올바른 휴대폰 번호를 입력해주세요. (예: 010-1234-5678)')
      : z
          .string()
          .trim()
          .optional()
          .refine(
            (v) => !v || PHONE_RE.test(v),
            '올바른 휴대폰 번호를 입력해주세요. (예: 010-1234-5678)',
          ),
    email: requireEmail
      ? z.string().trim().email('올바른 이메일 형식이 아닙니다.')
      : z
          .string()
          .trim()
          .optional()
          .refine(
            (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
            '올바른 이메일 형식이 아닙니다.',
          ),
    message: z
      .string()
      .trim()
      .min(MESSAGE_MIN, `문의 내용은 ${MESSAGE_MIN}자 이상 입력해주세요.`)
      .max(MESSAGE_MAX, `문의 내용은 ${MESSAGE_MAX}자 이하로 입력해주세요.`),
  })
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>

export function ContactForm({ section, tenantSlug }: SectionProps) {
  const title = getString(section.settings, 'section_title', '문의하기')
  const description = getString(section.settings, 'description')
  const requirePhone = getBoolean(section.settings, 'require_phone', true)
  const requireEmail = getBoolean(section.settings, 'require_email', false)

  const schema = buildSchema({ requirePhone, requireEmail })
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY

  const [submitting, setSubmitting] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      inquiry_type: 'GENERAL',
      name: '',
      phone: '',
      email: '',
      message: '',
    },
  })
  const messageValue = watch('message') ?? ''

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true)
    try {
      const recaptchaToken = await executeRecaptcha(siteKey, 'contact_submit')
      await publicApi.post(
        '/inquiries',
        {
          inquiry_type: values.inquiry_type,
          name: values.name,
          phone: values.phone ?? '',
          email: values.email || undefined,
          message: values.message,
          recaptcha_token: recaptchaToken ?? undefined,
        },
        { params: { tenant_slug: tenantSlug } },
      )
      toast.success('문의가 접수되었습니다. 빠른 시일 내 연락드리겠습니다.')
      reset()
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
        <EditableText
          as="h2"
          sectionId={section.id}
          field="section_title"
          initialValue={title}
          maxLength={40}
          className="text-2xl font-bold text-[color:var(--color-text-primary)] md:text-3xl"
        />
        {description && (
          <div className="mt-3">
            <EditableText
              as="p"
              sectionId={section.id}
              field="description"
              initialValue={description}
              maxLength={200}
              multiline
              className="whitespace-pre-line text-sm text-[color:var(--color-text-muted)]"
            />
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4" noValidate>
          <Field label="문의 유형" required>
            <select
              {...register('inquiry_type')}
              className={INPUT_CLASS}
              defaultValue="GENERAL"
            >
              {INQUIRY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <FieldError message={errors.inquiry_type?.message} />
          </Field>

          <Field label="이름" required>
            <input type="text" maxLength={100} {...register('name')} className={INPUT_CLASS} />
            <FieldError message={errors.name?.message} />
          </Field>

          <Field label="휴대폰 번호" required={requirePhone}>
            <input
              type="tel"
              placeholder="010-1234-5678"
              {...register('phone')}
              className={INPUT_CLASS}
            />
            <FieldError message={errors.phone?.message} />
          </Field>

          <Field label="이메일" required={requireEmail}>
            <input type="email" {...register('email')} className={INPUT_CLASS} />
            <FieldError message={errors.email?.message} />
          </Field>

          <Field
            label="문의 내용"
            required
            hint={`${messageValue.length} / ${MESSAGE_MAX}자`}
          >
            <textarea
              rows={5}
              maxLength={MESSAGE_MAX}
              {...register('message')}
              className={INPUT_CLASS}
            />
            <FieldError message={errors.message?.message} />
          </Field>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-[var(--border-radius-base)] bg-[var(--color-primary)] px-4 py-3 text-sm font-medium text-[color:var(--color-on-primary)] transition hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? '전송 중...' : '문의 보내기'}
          </button>

          {siteKey && (
            <p className="text-xs text-[color:var(--color-text-subtle)]">
              이 페이지는 reCAPTCHA로 보호되며, Google{' '}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                개인정보처리방침
              </a>
              과{' '}
              <a
                href="https://policies.google.com/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                이용약관
              </a>
              이 적용됩니다.
            </p>
          )}
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
          <span className="text-xs text-[color:var(--color-text-subtle)]">{hint}</span>
        )}
      </span>
      {children}
    </label>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="mt-1 text-xs text-[color:var(--color-danger)]">{message}</p>
  )
}
