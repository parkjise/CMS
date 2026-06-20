'use client'

import { use, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LoginForm } from '@/components/auth/LoginForm'
import { useClientAuthStore } from '@/lib/authStore'

interface Props {
  params: Promise<{ tenant_slug: string }>
}

export default function TenantLoginPage({ params }: Props) {
  const { tenant_slug } = use(params)
  const router = useRouter()
  const isLoggedIn = useClientAuthStore((s) => s.isLoggedIn)

  useEffect(() => {
    if (isLoggedIn) router.replace(`/${tenant_slug}`)
  }, [isLoggedIn, tenant_slug, router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-surface)] px-4">
      <div className="w-full max-w-sm rounded-[var(--border-radius-card)] border border-[color:var(--color-border)] bg-[var(--color-background)] p-8 shadow-[var(--shadow-card)]">
        <h1 className="text-xl font-bold text-[color:var(--color-text-primary)]">
          관리자 로그인
        </h1>
        <p className="mb-6 mt-1 text-sm text-[color:var(--color-text-muted)]">
          {tenant_slug}
        </p>

        <LoginForm
          tenantSlug={tenant_slug}
          autoFocus
          onSuccess={() => router.replace(`/${tenant_slug}`)}
        />

        <p className="mt-6 text-center text-xs text-[color:var(--color-text-subtle)]">
          <Link href={`/${tenant_slug}`} className="underline">
            홈으로 돌아가기
          </Link>
        </p>
      </div>
    </main>
  )
}
