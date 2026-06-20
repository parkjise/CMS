'use client'

import dynamic from 'next/dynamic'
import type { SectionProps } from './types'

const Map = dynamic(
  () => import('./Map').then((m) => ({ default: m.Map })),
  {
    ssr: false,
    loading: () => <MapSkeleton />,
  },
)

function MapSkeleton() {
  return (
    <section className="bg-[var(--color-background)] px-6 py-16 md:py-24">
      <div className="mx-auto max-w-5xl">
        <div className="h-5 w-1/2 animate-pulse rounded bg-[var(--color-surface-strong)]" />
        <div className="mt-6 aspect-[16/9] w-full animate-pulse rounded-[var(--border-radius-card)] bg-[var(--color-surface)]" />
      </div>
    </section>
  )
}

export function MapLoader(props: SectionProps) {
  return <Map {...props} />
}
