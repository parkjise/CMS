/**
 * 게시판 입력 폼 검사 — 목업 assets/js/board-form.js 와 같은 순서·문구
 * required 칸을 위에서부터: 비었으면 data-error, minlength 미달이면 data-error-short,
 * pattern 불일치면 data-error-pattern. 첫 오류 칸에 aria-invalid + 포커스.
 */
export function validateBoardForm(form: HTMLFormElement): string | null {
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'))
  const fields = form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[required]')
  for (const field of fields) {
    const value = field instanceof HTMLInputElement && field.type === 'checkbox' ? '' : field.value.trim()
    const empty = field instanceof HTMLInputElement && field.type === 'checkbox' ? !field.checked : !value
    let message: string | undefined
    if (empty) message = field.dataset.error
    else if ('minLength' in field && field.minLength > 0 && value.length < field.minLength) {
      message = field.dataset.errorShort
    } else if (field.dataset.pattern && !new RegExp(`^(?:${field.dataset.pattern})$`).test(value)) {
      message = field.dataset.errorPattern
    }
    if (message) {
      field.setAttribute('aria-invalid', 'true')
      field.focus()
      return message
    }
  }
  return null
}

/** 숫자만 남기기 (연락처) */
export const digitsOnly = (v: string) => v.replace(/[^0-9]/g, '')

/** 01012345678 → 010-1234-5678 / 0212345678 → 02-1234-5678 (서버 형식 검사용) */
export const formatPhone = (v: string) => {
  const d = digitsOnly(v)
  if (d.startsWith('02')) return d.replace(/^(02)(\d{3,4})(\d{4})$/, '$1-$2-$3')
  return d.replace(/^(0\d{2})(\d{3,4})(\d{4})$/, '$1-$2-$3')
}
