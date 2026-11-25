import { Monitor, Smartphone, Tablet } from 'lucide-react'
import {
  PREVIEW_DEVICES,
  type PreviewDevice,
  deviceWidth,
  previewDeviceHref,
} from '@/lib/previewDevice'

type Query = Record<string, string | string[] | undefined>

const ICONS = { pc: Monitor, tablet: Tablet, mobile: Smartphone } as const
// 폭은 PREVIEW_DEVICES 와 같게 — Tailwind 가 읽을 수 있게 글자 그대로 둔다
const FRAME_WIDTH = { tablet: 'w-[768px] min-w-[768px]', mobile: 'w-[390px] min-w-[390px]' } as const

interface PreviewDeviceSwitchProps {
  current: PreviewDevice
  query: Query
  /** PC 미리보기 화면 아래에 떠 있는 버튼 — 좁은 화면(틀 안 포함)에서는 숨긴다 */
  floating?: boolean
}

/** PC · 태블릿 · 휴대폰 고르기 (T-246) */
export function PreviewDeviceSwitch({ current, query, floating = false }: PreviewDeviceSwitchProps) {
  return (
    <nav
      aria-label="미리보기 기기 폭"
      className={
        floating
          ? 'fixed bottom-5 left-1/2 z-[60] hidden -translate-x-1/2 rounded-full bg-slate-900/90 p-1 shadow-lg lg:flex'
          : 'flex rounded-full bg-slate-800 p-1'
      }
    >
      {PREVIEW_DEVICES.map(({ key, label }) => {
        const Icon = ICONS[key]
        const active = key === current
        return (
          <a
            key={key}
            href={previewDeviceHref(query, key)}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${
              active ? 'bg-white text-slate-900' : 'text-slate-200 hover:bg-white/10'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </a>
        )
      })}
    </nav>
  )
}

interface PreviewDeviceFrameProps {
  device: Exclude<PreviewDevice, 'pc'>
  query: Query
}

/** 태블릿 · 휴대폰 폭 틀 — 안에는 같은 미리보기 주소(device 없이)를 띄운다 */
export function PreviewDeviceFrame({ device, query }: PreviewDeviceFrameProps) {
  const width = deviceWidth(device) ?? 390
  return (
    <div className="flex h-screen flex-col bg-slate-900">
      <div className="flex shrink-0 items-center justify-center gap-3 px-4 py-3">
        <PreviewDeviceSwitch current={device} query={query} />
        <span className="text-xs text-slate-400">{width}px</span>
      </div>
      <div className="flex min-h-0 flex-1 justify-center overflow-x-auto px-4 pb-4">
        <iframe
          title={`${device === 'tablet' ? '태블릿' : '휴대폰'} 폭 미리보기`}
          src={previewDeviceHref(query, 'pc')}
          className={`h-full rounded-xl border-0 bg-white shadow-2xl ${FRAME_WIDTH[device]}`}
        />
      </div>
    </div>
  )
}
