import { describe, expect, it, vi } from 'vitest'
import { applyFieldErrors } from '@/lib/applyFieldErrors'

describe('applyFieldErrors', () => {
  it('detail 객체 형태(field+message)를 setError로 전달한다', () => {
    const setError = vi.fn()
    const err = {
      response: {
        data: { detail: { field: 'phone', message: '잘못된 번호' } },
      },
    }
    expect(applyFieldErrors(err, setError)).toBe(true)
    expect(setError).toHaveBeenCalledWith('phone', {
      type: 'server',
      message: '잘못된 번호',
    })
  })

  it('FastAPI 기본 형태(loc + msg) 배열을 처리한다', () => {
    const setError = vi.fn()
    const err = {
      response: {
        data: {
          detail: [
            { loc: ['body', 'email'], msg: '이메일 형식 오류' },
            { loc: ['body', 'phone'], msg: '잘못된 번호' },
          ],
        },
      },
    }
    expect(applyFieldErrors(err, setError)).toBe(true)
    expect(setError).toHaveBeenNthCalledWith(1, 'email', {
      type: 'server',
      message: '이메일 형식 오류',
    })
    expect(setError).toHaveBeenNthCalledWith(2, 'phone', {
      type: 'server',
      message: '잘못된 번호',
    })
  })

  it('공통 형식 — error.details 의 필드마다 설정', () => {
    const setError = vi.fn()
    const err = {
      response: {
        data: {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '필수 입력 항목입니다',
            field: 'recipient_phone',
            details: [
              { field: 'recipient_phone', message: '필수 입력 항목입니다' },
              { field: 'recipient_email', message: '올바른 이메일 형식이 아닙니다' },
            ],
          },
        },
      },
    }
    expect(applyFieldErrors(err, setError)).toBe(true)
    expect(setError).toHaveBeenCalledTimes(2)
    expect(setError).toHaveBeenNthCalledWith(2, 'recipient_email', {
      type: 'server',
      message: '올바른 이메일 형식이 아닙니다',
    })
  })

  it('공통 형식 — details 가 없으면 error.field 하나', () => {
    const setError = vi.fn()
    const err = {
      response: { data: { success: false, error: { code: 'CONFLICT', message: '이미 사용 중', field: 'slug' } } },
    }
    expect(applyFieldErrors(err, setError)).toBe(true)
    expect(setError).toHaveBeenCalledWith('slug', { type: 'server', message: '이미 사용 중' })
  })

  it('공통 형식 — 필드 없는 오류는 false', () => {
    const setError = vi.fn()
    const err = { response: { data: { success: false, error: { code: 'NOT_FOUND', message: '없음', field: null } } } }
    expect(applyFieldErrors(err, setError)).toBe(false)
  })

  it('필드 정보가 없으면 false 반환', () => {
    const setError = vi.fn()
    expect(applyFieldErrors({ response: { data: {} } }, setError)).toBe(false)
    expect(setError).not.toHaveBeenCalled()
  })

  it('잘못된 입력 형태도 안전하게 처리', () => {
    const setError = vi.fn()
    expect(applyFieldErrors(null, setError)).toBe(false)
    expect(applyFieldErrors(undefined, setError)).toBe(false)
  })
})
