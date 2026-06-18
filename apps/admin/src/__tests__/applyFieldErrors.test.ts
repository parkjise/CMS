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
