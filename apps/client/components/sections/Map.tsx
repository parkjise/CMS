'use client'

import { useEffect, useRef, useState } from 'react'
import { getString } from '@/lib/sectionSettings'
import type { SectionProps } from './types'

declare global {
  interface Window {
    kakao?: {
      maps?: {
        load: (cb: () => void) => void
        LatLng: new (lat: number, lng: number) => unknown
        Map: new (container: HTMLElement, options: object) => unknown
        Marker: new (options: { position: unknown }) => { setMap: (m: unknown) => void }
      }
    }
  }
}

const SDK_ID = 'kakao-maps-sdk'

function loadKakaoSdk(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('no window'))
    if (window.kakao?.maps) return resolve()
    const existing = document.getElementById(SDK_ID) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('sdk-load-failed')), {
        once: true,
      })
      return
    }
    const script = document.createElement('script')
    script.id = SDK_ID
    script.async = true
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&autoload=false`
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('sdk-load-failed'))
    document.head.appendChild(script)
  })
}

export function Map({ section }: SectionProps) {
  const address = getString(section.settings, 'address')
  const addressDetail = getString(section.settings, 'address_detail')
  const latRaw = getString(section.settings, 'latitude')
  const lngRaw = getString(section.settings, 'longitude')
  const lat = Number.parseFloat(latRaw)
  const lng = Number.parseFloat(lngRaw)
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng)

  const apiKey = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    if (!apiKey || !hasCoords || !containerRef.current) return
    let cancelled = false
    loadKakaoSdk(apiKey)
      .then(() => {
        if (cancelled || !window.kakao?.maps) return
        window.kakao.maps.load(() => {
          if (cancelled || !containerRef.current || !window.kakao?.maps) return
          const center = new window.kakao.maps.LatLng(lat, lng)
          const map = new window.kakao.maps.Map(containerRef.current, {
            center,
            level: 4,
          })
          new window.kakao.maps.Marker({ position: center }).setMap(map)
          setMapReady(true)
        })
      })
      .catch(() => setMapReady(false))
    return () => {
      cancelled = true
    }
  }, [apiKey, hasCoords, lat, lng])

  return (
    <section
      data-section-id={section.id}
      data-section-type="MAP"
      className="bg-white px-6 py-16 md:py-24"
    >
      <div className="mx-auto max-w-5xl">
        {address && (
          <div>
            <p
              data-editable
              data-field="address"
              data-section-id={section.id}
              className="text-base font-medium text-slate-900"
            >
              {address}
            </p>
            {addressDetail && (
              <p
                data-editable
                data-field="address_detail"
                data-section-id={section.id}
                className="mt-1 text-sm text-slate-600"
              >
                {addressDetail}
              </p>
            )}
          </div>
        )}

        {apiKey && hasCoords ? (
          <div
            ref={containerRef}
            className="mt-6 aspect-[16/9] w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
            aria-label="지도"
          >
            {!mapReady && (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                지도 로딩 중...
              </div>
            )}
          </div>
        ) : (
          address && (
            <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
              지도는 별도 설정 후 표시됩니다.
            </div>
          )
        )}
      </div>
    </section>
  )
}
