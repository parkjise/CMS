'use client'

import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import type { PublicSection } from '@/lib/publicSite.types'

interface NavbarProps {
  tenantName: string
  sections: PublicSection[]
}

export function Navbar({ tenantName, sections }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleNavClick = (sectionId: string) => {
    setMobileOpen(false)
    if (typeof document === 'undefined') return
    const el = document.querySelector(`[data-section-id="${sectionId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const navSections = sections.filter((s) => s.is_active)

  return (
    <header
      className={[
        'sticky top-0 z-40 w-full transition-all',
        scrolled
          ? 'border-b border-[color:var(--color-border)] bg-[var(--color-background)]/95 shadow-sm backdrop-blur'
          : 'bg-transparent',
      ].join(' ')}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <button
          type="button"
          onClick={() =>
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }
          className="text-lg font-bold text-[color:var(--color-text-primary)]"
          aria-label={`${tenantName} 홈으로 이동`}
        >
          {tenantName}
        </button>

        <nav className="hidden md:block" aria-label="페이지 내 섹션">
          <ul className="flex items-center gap-6">
            {navSections.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => handleNavClick(s.id)}
                  className="text-sm text-[color:var(--color-text-secondary)] transition hover:text-[color:var(--color-primary)]"
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="md:hidden"
          aria-label={mobileOpen ? '메뉴 닫기' : '메뉴 열기'}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? (
            <X className="h-6 w-6 text-[color:var(--color-text-secondary)]" />
          ) : (
            <Menu className="h-6 w-6 text-[color:var(--color-text-secondary)]" />
          )}
        </button>
      </div>

      {mobileOpen && (
        <nav
          className="border-t border-[color:var(--color-border)] bg-[var(--color-background)] md:hidden"
          aria-label="모바일 섹션 메뉴"
        >
          <ul className="flex flex-col py-2">
            {navSections.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => handleNavClick(s.id)}
                  className="block w-full px-6 py-3 text-left text-sm text-[color:var(--color-text-secondary)] hover:bg-[var(--color-surface)]"
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  )
}
