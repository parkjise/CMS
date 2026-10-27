import { afterEach, describe, expect, it } from 'vitest'
import { authApi, setAccessToken } from '@/lib/api'
import { uploadImage } from '@/lib/uploadImage'

/**
 * 업로드는 multipart + Bearer 토큰으로 보내야 한다 (T-064-A).
 * authApi 기본 헤더(application/json) 그대로면 axios 가 FormData 를 JSON 문자열로 바꿔 400 이 난다.
 */
const originalAdapter = authApi.defaults.adapter

afterEach(() => {
  authApi.defaults.adapter = originalAdapter
  setAccessToken(null)
})

describe('uploadImage', () => {
  it('FormData 를 multipart 로, 토큰을 붙여 보낸다', async () => {
    setAccessToken('tok')
    let sent: { contentType: unknown; auth: unknown; data: unknown } | null = null
    authApi.defaults.adapter = async (config) => {
      sent = {
        contentType: config.headers.getContentType(),
        auth: config.headers.Authorization,
        data: config.data,
      }
      return {
        status: 200,
        statusText: '',
        headers: {},
        config,
        data: { success: true, data: { id: 'f1', url: 'https://cdn.example.com/a.webp' } },
      }
    }
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    const result = await uploadImage(file, 's1', 'gallery')

    expect(result.url).toBe('https://cdn.example.com/a.webp')
    expect(String(sent!.contentType)).toMatch(/^multipart\/form-data/)
    expect(sent!.auth).toBe('Bearer tok')
    expect(sent!.data).toBeInstanceOf(FormData)
    expect((sent!.data as FormData).get('context')).toBe('gallery')
  })
})
