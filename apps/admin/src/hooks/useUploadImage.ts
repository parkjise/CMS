import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'

/** 이미지 업로드 (POST /v1/upload/image — WebP 최적화) — 갤러리 폼 등 (T-064-A) */

export type ImageContext =
  | 'hero'
  | 'gallery'
  | 'intro'
  | 'services'
  | 'team'
  | 'portfolio'
  | 'seo'
  /** 로고 · 파비콘 — 섹션 없이 (T-036-A) */
  | 'site'

export interface UploadImageInput {
  file: File
  /** SEO 공유 이미지처럼 섹션에 속하지 않으면 생략 (T-037-C) */
  sectionId?: string
  context: ImageContext
}

export interface UploadImageResult {
  id: string
  url: string
  original_size_kb: number
  optimized_size_kb: number
}

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024 // 20MB

export const isUploadableImage = (file: File) =>
  file.type.startsWith('image/') && file.size <= MAX_IMAGE_BYTES

export const uploadImage = async ({ file, sectionId, context }: UploadImageInput) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('context', context)
  if (sectionId) formData.append('section_id', sectionId)
  // api 기본 헤더(application/json)면 axios 가 FormData 를 JSON 으로 바꿔 버린다 —
  // multipart 로 지정하면 브라우저가 boundary 를 붙여 보낸다
  const { data } = await api.post('/v1/upload/image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data.data as UploadImageResult
}

export const useUploadImage = () => useMutation({ mutationFn: uploadImage })
