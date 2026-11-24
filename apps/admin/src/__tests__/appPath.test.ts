import { describe, expect, it } from 'vitest'
import { APP_BASE, appPath, routePath } from '@/lib/appPath'

describe('하위 경로 배포 (T-236)', () => {
  it('보통은 하위 경로가 없어 주소 그대로', () => {
    expect(APP_BASE).toBe('')
    expect(appPath('/login')).toBe('/login')
    expect(routePath('/admin/site/seo')).toBe('/admin/site/seo')
  })

  it('GitHub Pages 처럼 /CMS/admin 아래면 붙이고 뗀다', () => {
    const base = '/CMS/admin'
    expect(appPath('/login', base)).toBe('/CMS/admin/login')
    expect(appPath('/admin/billing?tab=method', base)).toBe('/CMS/admin/admin/billing?tab=method')
    expect(routePath('/CMS/admin/admin/site/seo', base)).toBe('/admin/site/seo')
    expect(routePath('/CMS/admin', base)).toBe('/')
    // 비슷한 이름은 떼지 않는다
    expect(routePath('/CMS/administrator', base)).toBe('/CMS/administrator')
  })
})
