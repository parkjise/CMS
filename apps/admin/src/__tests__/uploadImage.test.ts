import { afterEach, describe, expect, it } from 'vitest'
import { api } from '@/lib/api'
import { uploadImage } from '@/hooks/useUploadImage'

/**
 * 업로드는 multipart 로 보내야 한다 (T-064-A).
 * api 기본 헤더(application/json) 그대로면 axios 가 FormData 를 JSON 문자열로 바꿔 400 이 난다.
 */
const originalAdapter = api.defaults.adapter

afterEach(() => {
  api.defaults.adapter = originalAdapter
})

describe('uploadImage', () => {
  it('FormData 를 그대로 multipart 로 보낸다', async () => {
    let sent: { contentType: unknown; data: unknown; url?: string } | null = null
    api.defaults.adapter = async (config) => {
      sent = { contentType: config.headers.getContentType(), data: config.data, url: config.url }
      return {
        status: 200,
        statusText: '',
        headers: {},
        config,
        data: { success: true, data: { id: 'f1', url: 'https://cdn.example.com/a.webp' } },
      }
    }
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    const result = await uploadImage({ file, sectionId: 's1', context: 'gallery' })

    expect(result.url).toBe('https://cdn.example.com/a.webp')
    expect(sent!.url).toBe('/v1/upload/image')
    expect(String(sent!.contentType)).toMatch(/^multipart\/form-data/)
    expect(sent!.data).toBeInstanceOf(FormData)
    const form = sent!.data as FormData
    expect(form.get('context')).toBe('gallery')
    expect(form.get('section_id')).toBe('s1')
    expect(form.get('file')).toBeInstanceOf(File)
  })
})
