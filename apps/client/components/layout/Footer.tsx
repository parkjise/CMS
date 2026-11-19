import { Facebook, Globe, Instagram, MessageCircle, Youtube } from 'lucide-react'
import type { PublicSiteSettings, PublicSnsSettings } from '@/lib/publicSite.types'
import { hoursRows } from '@/lib/siteHours'

interface FooterProps {
  tenantName: string
  sns: PublicSnsSettings | null
  /** 사업체 공통 정보 (T-036-A) — 입력한 칸만 보여 준다 */
  info?: PublicSiteSettings | null
  /** 약관 · 방침 링크 앞 주소 (T-200) — '/{slug}', 고객 도메인이면 ''. 없으면 링크를 숨긴다 */
  policyBase?: string
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

const telHref = (phone: string) => `tel:${phone.replace(/[^0-9+]/g, '')}`

/** 사이트 기본정보의 연락처 · 운영시간 · 사업자 정보 (T-036-A · T-222). 숨긴 항목은 이미 null */
function BusinessInfo({ tenantName, info }: { tenantName: string; info: PublicSiteSettings }) {
  const address = [info.postal_code && `(${info.postal_code})`, info.address, info.address_detail]
    .filter(Boolean)
    .join(' ')
  const hours = [
    ...hoursRows(info).map((row) => `${row.days} ${row.time}`),
    info.hours_note,
    info.hours_temp_note,
  ].filter(Boolean)
  const businessKind = [info.business_type, info.business_item].filter(Boolean).join(' / ')
  const company = [
    info.company_name || tenantName,
    info.ceo && `대표자 ${info.ceo}`,
    info.business_number && `사업자등록번호 ${info.business_number}`,
    info.mail_order_number && `통신판매업 신고번호 ${info.mail_order_number}`,
    businessKind && `업태 · 종목 ${businessKind}`,
  ].filter(Boolean)
  const officer = info.privacy_officer
    ? `개인정보 보호책임자 ${info.privacy_officer}${info.privacy_email ? ` (${info.privacy_email})` : ''}`
    : null
  const contact = Boolean(info.phone || info.cs_phone || info.fax || info.email)
  if (!contact && !address && hours.length === 0 && company.length === 1 && !officer) {
    return null
  }
  const link = 'hover:text-[color:var(--color-primary)]'
  return (
    <div
      className="mx-auto mb-6 max-w-6xl space-y-1 text-center text-sm text-[color:var(--color-text-secondary)] md:text-left"
      data-testid="footer-business-info"
    >
      {contact && (
        <p className="flex flex-wrap justify-center gap-x-4 md:justify-start">
          {info.phone && (
            <a href={telHref(info.phone)} className={link}>
              TEL {info.phone}
            </a>
          )}
          {info.cs_phone && (
            <a href={telHref(info.cs_phone)} className={link}>
              고객센터 {info.cs_phone}
            </a>
          )}
          {info.fax && <span>FAX {info.fax}</span>}
          {info.email && (
            <a href={`mailto:${info.email}`} className={link}>
              {info.email}
            </a>
          )}
        </p>
      )}
      {address && <address className="not-italic">{address}</address>}
      {hours.length > 0 && <p>{hours.join(' · ')}</p>}
      {(company.length > 1 || officer) && (
        <p className="text-xs text-[color:var(--color-text-subtle)]">
          {[...company, officer].filter(Boolean).join(' | ')}
        </p>
      )}
    </div>
  )
}

export function Footer({ tenantName, sns, info, policyBase }: FooterProps) {
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

        {policyBase !== undefined && (
          <nav aria-label="약관 및 정책" className="flex gap-3 text-xs">
            <a
              href={`${policyBase}/terms`}
              className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-primary)]"
            >
              이용약관
            </a>
            <a
              href={`${policyBase}/privacy`}
              className="font-semibold text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-primary)]"
            >
              개인정보처리방침
            </a>
          </nav>
        )}

        <p className="text-xs text-[color:var(--color-text-subtle)]">
          {info?.copyright || `© ${year} ${tenantName}`}
        </p>
      </div>
    </footer>
  )
}
