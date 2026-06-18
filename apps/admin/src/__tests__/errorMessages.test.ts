import { describe, expect, it } from 'vitest'
import {
  ERROR_MESSAGES,
  STATUS_MESSAGES,
  pickErrorMessage,
} from '@/lib/errorMessages'

describe('pickErrorMessage', () => {
  it('네트워크 에러는 한글 안내로 변환', () => {
    expect(pickErrorMessage({ code: 'ERR_NETWORK' })).toBe(
      ERROR_MESSAGES.NETWORK_ERROR
    )
    expect(pickErrorMessage({ message: 'Network Error' })).toBe(
      ERROR_MESSAGES.NETWORK_ERROR
    )
  })

  it('detail이 알려진 코드 문자열이면 매핑된 메시지를 반환', () => {
    const err = {
      response: { status: 422, data: { detail: 'PLAN_LIMIT_EXCEEDED' } },
    }
    expect(pickErrorMessage(err)).toBe(ERROR_MESSAGES.PLAN_LIMIT_EXCEEDED)
  })

  it('detail이 모르는 문자열이면 그대로 반환', () => {
    const err = {
      response: { status: 400, data: { detail: '커스텀 메시지' } },
    }
    expect(pickErrorMessage(err)).toBe('커스텀 메시지')
  })

  it('detail.message가 있으면 우선 사용', () => {
    const err = {
      response: {
        status: 400,
        data: { detail: { code: 'X', message: '서버 메시지' } },
      },
    }
    expect(pickErrorMessage(err)).toBe('서버 메시지')
  })

  it('detail이 없을 때 HTTP 상태 코드 매핑 사용', () => {
    const err = { response: { status: 500, data: {} } }
    expect(pickErrorMessage(err)).toBe(STATUS_MESSAGES[500])
  })

  it('아무 정보 없으면 기본 메시지', () => {
    expect(pickErrorMessage({})).toBe('예상치 못한 오류가 발생했습니다.')
  })

  it('문자열 그대로 전달 시 그대로 반환', () => {
    expect(pickErrorMessage('직접 메시지')).toBe('직접 메시지')
  })
})
