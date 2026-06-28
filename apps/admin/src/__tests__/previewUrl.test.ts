import { describe, expect, it } from 'vitest'
import { buildTemplatePreviewUrl } from '@/lib/previewUrl'

describe('buildTemplatePreviewUrl (T-057)', () => {
  it('slug/preview?tpl= 형태의 URL을 만든다', () => {
    const url = buildTemplatePreviewUrl('my-shop', 'tpl-123')
    expect(url).toContain('/my-shop/preview?tpl=tpl-123')
  })

  it('slug와 templateId를 URL 인코딩한다', () => {
    const url = buildTemplatePreviewUrl('가게 이름', 'a/b?c')
    expect(url).toContain(encodeURIComponent('가게 이름'))
    expect(url).toContain(encodeURIComponent('a/b?c'))
    // 인코딩되지 않은 원본 특수문자는 쿼리/경로에 노출되지 않는다
    expect(url).not.toContain('가게 이름')
  })

  it('base URL 끝의 슬래시 중복을 제거한다', () => {
    const url = buildTemplatePreviewUrl('shop', 't1')
    expect(url).not.toContain('//shop')
  })
})
