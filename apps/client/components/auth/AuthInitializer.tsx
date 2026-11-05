'use client'

import { useEffect } from 'react'
import { useClientAuthStore } from '@/lib/authStore'

export function AuthInitializer({ tenantId = null }: { tenantId?: string | null }) {
  const initialize = useClientAuthStore((s) => s.initialize)
  const setSiteTenant = useClientAuthStore((s) => s.setSiteTenant)

  useEffect(() => {
    setSiteTenant(tenantId)
    initialize()
  }, [tenantId, setSiteTenant, initialize])

  return null
}
