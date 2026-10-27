// 관리자 이미지 업로드 검사 · 표시 도우미 (기획서 AD-02-B, T-037-B)

import { MAX_IMAGE_BYTES } from '@/hooks/useUploadImage'

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
/** 이보다 크면 '자동으로 최적화됩니다' 안내 (기획서: 5MB 초과 ~ 20MB) */
export const LARGE_IMAGE_BYTES = 5 * 1024 * 1024

export const formatKb = (kb: number) =>
  kb >= 1024 ? `${(kb / 1024).toFixed(1)}MB` : `${Math.round(kb)}KB`

/** 올리기 전 검사 — 문제 없으면 null */
export function checkImageFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return 'JPG, PNG, WebP, GIF만 가능합니다'
  if (file.size > MAX_IMAGE_BYTES) return '파일이 너무 큽니다 (최대 20MB)'
  return null
}
