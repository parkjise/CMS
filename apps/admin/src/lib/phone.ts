/** 번호 비교용 — 하이픈 · 공백을 뺀 숫자만 (T-204) */
export const phoneDigits = (phone: string | null | undefined) => (phone ?? '').replace(/\D/g, '')

/** 문자 인증을 마친 번호 — 설정 저장에 id 를 함께 보낸다 */
export interface PhoneVerified {
  /** 인증한 번호 (숫자만) */
  digits: string
  verificationId: string
}
