import { authApi } from './api'

export type ImageContext =
  | 'hero'
  | 'gallery'
  | 'intro'
  | 'services'
  | 'team'
  | 'portfolio'

export interface UploadResult {
  id: string
  url: string
  original_size_kb: number
  optimized_size_kb: number
  width: number
  height: number
  format: string
}

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024 // 20MB

export interface ValidationError {
  code: 'FILE_TOO_LARGE' | 'INVALID_TYPE'
  message: string
}

export function validateImageFile(file: File): ValidationError | null {
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      code: 'FILE_TOO_LARGE',
      message: '파일 크기가 20MB를 초과합니다.',
    }
  }
  if (!file.type.startsWith('image/')) {
    return { code: 'INVALID_TYPE', message: '이미지 파일만 업로드 가능합니다.' }
  }
  return null
}

export async function uploadImage(
  file: File,
  sectionId: string,
  context: ImageContext,
  onProgress?: (pct: number) => void,
): Promise<UploadResult> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('context', context)
  formData.append('section_id', sectionId)

  const { data } = await authApi.post('/upload/image', formData, {
    onUploadProgress: (e) => {
      if (e.total) onProgress?.(Math.round((e.loaded / e.total) * 100))
    },
  })
  return data.data as UploadResult
}
