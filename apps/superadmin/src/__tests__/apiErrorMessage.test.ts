import { describe, expect, it } from 'vitest'
import { apiErrorMessage } from '@/lib/errors'

describe('apiErrorMessage (공통 에러 형식)', () => {
  it('서버 문구가 있으면 그대로', () => {
    const err = {
      response: { data: { success: false, error: { code: 'CONFLICT', message: '이미 사용 중인 slug입니다.' } } },
    }
    expect(apiErrorMessage(err, '생성에 실패했습니다.')).toBe('이미 사용 중인 slug입니다.')
  })

  it('문구가 없거나 비어 있으면 fallback', () => {
    expect(apiErrorMessage({ response: { data: { error: { code: 'X', message: ' ' } } } }, '실패')).toBe('실패')
    expect(apiErrorMessage({ response: { data: { detail: 'NOT_FOUND' } } }, '실패')).toBe('실패')
    expect(apiErrorMessage(new Error('Network Error'), '실패')).toBe('실패')
    expect(apiErrorMessage(null, '실패')).toBe('실패')
  })
})
