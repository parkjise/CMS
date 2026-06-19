import type { PublicSettingItem } from './publicSite.types'

export function getString(
  settings: PublicSettingItem[],
  key: string,
  fallback = '',
): string {
  return settings.find((s) => s.field_key === key)?.field_value ?? fallback
}

export function getBoolean(
  settings: PublicSettingItem[],
  key: string,
  fallback = false,
): boolean {
  const raw = settings.find((s) => s.field_key === key)?.field_value
  if (raw == null) return fallback
  return raw === 'true' || raw === '1'
}

export function getJson<T>(
  settings: PublicSettingItem[],
  key: string,
  fallback: T,
): T {
  const raw = settings.find((s) => s.field_key === key)?.field_value
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}
