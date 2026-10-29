import { Facebook, Globe, Instagram, MessageCircle, Youtube } from 'lucide-react'
import type { PublicSiteSettings, PublicSnsSettings } from '@/lib/publicSite.types'

interface FooterProps {
  tenantName: string
  sns: PublicSnsSettings | null
  /** 사업체 공통 정보 (T-036-A) — 입력한 칸만 보여 준다 */
  info?: PublicSiteSettings | null
}

interface SnsLink {
  href: string
  label: string
  icon: React.ReactNode
}

function buildSnsLinks(sns: PublicSnsSettings | null): SnsLink[] {
  if (!sns) return []
  const items: SnsLink[] = []
  if (sns.kakao_url)
    items.push({
      href: sns.kakao_url,
      label: '카카오톡 채널',
      icon: <MessageCircle className="h-5 w-5" />,
    })
  if (sns.instagram_url)
    items.push({
      href: sns.instagram_url,
      label: '인스타그램',
      icon: <Instagram className="h-5 w-5" />,
    })
  if (sns.facebook_url)
    items.push({
      href: sns.facebook_url,
      label: '페이스북',
      icon: <Facebook className="h-5 w-5" />,
    })
  if (sns.youtube_url)
    items.push({
      href: sns.youtube_url,
      label: '유튜브',
      icon: <Youtube className="h-5 w-5" />,
    })
  if (sns.blog_url)
    items.push({
      href: sns.blog_url,
      label: '블로그',
      icon: <Globe className="h-5 w-5" />,
    })
  if (sns.naver_url)
    items.push({
      href: sns.naver_url,
      label: '네이버',
      icon: <Globe className="h-5 w-5" />,
    })
  return items
}

/** 공통 설정의 연락처 · 영업시간 · 사업자 정보 (비어 있으면 그리지 않음) */
function BusinessInfo({ tenantName, info }: { tenantName: string; info: PublicSiteSettings }) {
  const address = [info.address, info.address_detail].filter(Boolean).join(' ')
  const hours = [
    info.hours_weekday && `평일 ${info.hours_weekday}`,
    info.hours_saturday && `토요일 ${info.hours_saturday}`,
    info.hours_note,
  ].filter(Boolean)
  const company = [
    tenantName,
    info.ceo && `대표자 ${info.ceo}`,
    info.business_number && `사업자등록번호 ${info.business_number}`,
  ].filter(Boolean)
  if (!info.phone && !info.email && !address && hours.length === 0 && company.length === 1) {
    return null
  }
  return (
    <div
      className="mx-auto mb-6 max-w-6xl space-y-1 text-center text-sm text-[color:var(--color-text-secondary)] md:text-left"
      data-testid="footer-business-info"
    >
      {(info.phone || info.email) && (
        <p className="flex flex-wrap justify-center gap-x-4 md:justify-start">
          {info.phone && (
            <a href={`tel:${info.phone.replace(/[^0-9]/g, '')}`} className="hover:text-[color:var(--color-primary)]">
              TEL {info.phone}
            </a>
          )}
          {info.email && (
            <a href={`mailto:${info.email}`} className="hover:text-[color:var(--color-primary)]">
              {info.email}
            </a>
          )}
        </p>
      )}
      {address && <address className="not-italic">{address}</address>}
      {hours.length > 0 && <p>{hours.join(' · ')}</p>}
      {company.length > 1 && (
        <p className="text-xs text-[color:var(--color-text-subtle)]">{company.join(' | ')}</p>
      )}
    </div>
  )
}

export function Footer({ tenantName, sns, info }: FooterProps) {
  const year = new Date().getFullYear()
  // 관리자 'SNS 노출 위치' 에서 푸터 아이콘을 끄면 숨긴다 (T-038-A)
  const links = sns?.show_in_footer === false ? [] : buildSnsLinks(sns)

  return (
    <footer className="border-t border-[color:var(--color-border)] bg-[var(--color-surface)] px-6 py-10">
      {info && <BusinessInfo tenantName={tenantName} info={info} />}
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 md:flex-row md:justify-between">
        <p className="text-sm font-medium text-[color:var(--color-text-secondary)]">
          {tenantName}
        </p>

        {links.length > 0 && (
          <ul className="flex items-center gap-3">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={link.label}
                  className="flex h-9 w-9 items-center justify-center rounded-[var(--border-radius-pill)] border border-[color:var(--color-border)] text-[color:var(--color-text-muted)] transition hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-primary)]"
                >
                  {link.icon}
                </a>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-[color:var(--color-text-subtle)]">
          © {year} {tenantName}
        </p>
      </div>
    </footer>
  )
}
