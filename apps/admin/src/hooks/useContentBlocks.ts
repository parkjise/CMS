import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

/** 공통 블록 (T-260, 콘텐츠 관리 기획서 CM-04) — 여러 페이지가 함께 쓰는 섹션 값 한 벌 */
export interface ContentBlockUsage {
  section_id: string
  label: string
  page_key: string
  is_active: boolean
}

export interface ContentBlock {
  id: string
  name: string
  section_type: string
  type_label: string
  usage: ContentBlockUsage[]
  updated_at: string
}

/** reference: 블록을 고치면 함께 바뀜 · copy: 값만 복사 */
export type BlockMode = 'reference' | 'copy'

export const CONTENT_BLOCKS_KEY = ['content-blocks'] as const

export function useContentBlocks(enabled = true) {
  return useQuery({
    queryKey: CONTENT_BLOCKS_KEY,
    enabled,
    queryFn: async (): Promise<ContentBlock[]> => {
      const { data } = await api.get('/v1/contents/blocks')
      return data.data
    },
    staleTime: 15 * 1000,
    meta: { suppressGlobalError: true },
  })
}

/** 블록이 바뀌면 섹션 목록 · 섹션 하나(block_id)도 다시 읽는다 */
function useInvalidateBlocks() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: CONTENT_BLOCKS_KEY }),
      queryClient.invalidateQueries({ queryKey: ['sections'] }),
      queryClient.invalidateQueries({ queryKey: ['section'] }),
    ])
}

export function useCreateContentBlock() {
  const invalidate = useInvalidateBlocks()
  return useMutation({
    mutationFn: async (input: { section_id: string; name: string }): Promise<ContentBlock> => {
      const { data } = await api.post('/v1/contents/blocks', input)
      return data.data
    },
    onSuccess: invalidate,
  })
}

export function useRenameContentBlock() {
  const invalidate = useInvalidateBlocks()
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      await api.patch(`/v1/contents/blocks/${id}`, { name })
    },
    onSuccess: invalidate,
  })
}

export function useDeleteContentBlock() {
  const invalidate = useInvalidateBlocks()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/v1/contents/blocks/${id}`)
    },
    onSuccess: invalidate,
  })
}

export function useAddBlockSection() {
  const invalidate = useInvalidateBlocks()
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: {
      id: string
      page_key: string
      mode: BlockMode
    }): Promise<{ section_id: string }> => {
      const { data } = await api.post(`/v1/contents/blocks/${id}/sections`, input)
      return data.data
    },
    onSuccess: invalidate,
  })
}

export function useUnlinkBlock() {
  const invalidate = useInvalidateBlocks()
  return useMutation({
    mutationFn: async (sectionId: string) => {
      await api.post('/v1/contents/blocks/unlink', { section_id: sectionId })
    },
    onSuccess: invalidate,
  })
}
