/**
 * 방문자 회원 화면 검증 (T-113) — 서버(app/schemas/site_member.py)와 같은 규칙 · 문구 (기획서 16.3)
 */
import { z } from 'zod'

export const MESSAGES = {
  name: '이름을 올바르게 입력해주세요',
  email: '올바른 이메일 형식이 아닙니다',
  password: '영문, 숫자를 포함하여 8자 이상 입력해주세요',
  passwordConfirm: '비밀번호가 일치하지 않습니다',
  phone: '올바른 휴대폰 번호 형식이 아닙니다',
  phoneVerified: '휴대폰 인증을 완료해주세요',
  terms: '필수 약관에 동의해주세요',
  required: '필수 입력 항목입니다',
} as const

const NAME_RE = /^[가-힣a-zA-Z ]{2,100}$/
export const PHONE_RE = /^01[016789]-?\d{3,4}-?\d{4}$/

/** 비밀번호 강도 체크 항목 (8자↑ · 영문 · 숫자) */
export const passwordChecks = (value: string) => ({
  length: value.length >= 8,
  letter: /[A-Za-z]/.test(value),
  digit: /\d/.test(value),
})

export const isPasswordValid = (value: string) =>
  Object.values(passwordChecks(value)).every(Boolean) && value.length <= 100

const name = z.string().trim().regex(NAME_RE, MESSAGES.name)
const email = z.string().trim().min(1, MESSAGES.required).email(MESSAGES.email).max(255)
const password = z.string().refine(isPasswordValid, MESSAGES.password)
const phone = z.string().trim().regex(PHONE_RE, MESSAGES.phone)
const verified = z.string().min(1, MESSAGES.phoneVerified)

export const loginSchema = z.object({
  email,
  password: z.string().min(1, MESSAGES.required),
  remember_me: z.boolean(),
})

export const joinSchema = z
  .object({
    name,
    email,
    password,
    password_confirm: z.string(),
    phone,
    phone_verification_id: verified,
    birth_date: z.string().optional(),
    terms_agree: z.boolean(),
    privacy_agree: z.boolean(),
    marketing_agree: z.boolean(),
  })
  .refine((v) => v.password === v.password_confirm, {
    path: ['password_confirm'],
    message: MESSAGES.passwordConfirm,
  })
  .refine((v) => v.terms_agree && v.privacy_agree, {
    path: ['terms_agree'],
    message: MESSAGES.terms,
  })

export const joinSocialSchema = z
  .object({
    email: z.string().trim().optional(),
    email_required: z.boolean(),
    phone,
    phone_verification_id: verified,
    terms_agree: z.boolean(),
    privacy_agree: z.boolean(),
    marketing_agree: z.boolean(),
  })
  .refine((v) => !v.email_required || email.safeParse(v.email ?? '').success, {
    path: ['email'],
    message: MESSAGES.email,
  })
  .refine((v) => v.terms_agree && v.privacy_agree, {
    path: ['terms_agree'],
    message: MESSAGES.terms,
  })

export const findEmailSchema = z.object({ name, phone, phone_verification_id: verified })

export const findPasswordSchema = z.object({ email, phone, phone_verification_id: verified })

export const resetPasswordSchema = z
  .object({ password, password_confirm: z.string() })
  .refine((v) => v.password === v.password_confirm, {
    path: ['password_confirm'],
    message: MESSAGES.passwordConfirm,
  })

export type LoginValues = z.infer<typeof loginSchema>
export type JoinValues = z.infer<typeof joinSchema>
export type JoinSocialValues = z.infer<typeof joinSocialSchema>
export type FindEmailValues = z.infer<typeof findEmailSchema>
export type FindPasswordValues = z.infer<typeof findPasswordSchema>
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>
