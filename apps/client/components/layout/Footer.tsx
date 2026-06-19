import { Facebook, Globe, Instagram, MessageCircle, Youtube } from 'lucide-react'
import type { PublicSnsSettings } from '@/lib/publicSite.types'

interface FooterProps {
  tenantName: string
  sns: PublicSnsSettings | null
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

export function Footer({ tenantName, sns }: FooterProps) {
  const year = new Date().getFullYear()
  const links = buildSnsLinks(sns)

  return (
    <footer className="border-t border-[color:var(--color-border)] bg-[var(--color-surface)] px-6 py-10">
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
