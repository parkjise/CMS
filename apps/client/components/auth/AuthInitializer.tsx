'use client'

import { useEffect } from 'react'
import { useClientAuthStore } from '@/lib/authStore'

export function AuthInitializer() {
  const initialize = useClientAuthStore((s) => s.initialize)

  useEffect(() => {
    initialize()
  }, [initialize])

  return null
}
