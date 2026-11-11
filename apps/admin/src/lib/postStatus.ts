import dayjs from 'dayjs'
import type { PostListItem, PostStatus } from '@cms/types'

export const STATUS_LABELS: Record<PostStatus, string> = {
  DRAFT: '임시저장',
  PUBLISHED: '공개',
  PRIVATE: '비공개',
}

export const STATUS_STYLES: Record<PostStatus, string> = {
  DRAFT: 'bg-amber-50 text-amber-700',
  PUBLISHED: 'bg-emerald-50 text-emerald-700',
  PRIVATE: 'bg-slate-100 text-slate-600',
}

/** 예약 글 (T-189) — 공개 상태지만 공개 시각이 아직 오지 않았다 */
export const isScheduled = (post: Pick<PostListItem, 'status' | 'published_at'>) =>
  post.status === 'PUBLISHED' &&
  post.published_at !== null &&
  dayjs(post.published_at).isAfter(dayjs())

/** 글 목록의 상태 표시 — 예약 글은 공개 예정 시각을 함께 */
export const statusBadge = (post: Pick<PostListItem, 'status' | 'published_at'>) =>
  isScheduled(post)
    ? {
        label: `예약 · ${dayjs(post.published_at).format('MM/DD HH:mm')}`,
        className: 'bg-blue-50 text-blue-700',
      }
    : { label: STATUS_LABELS[post.status], className: STATUS_STYLES[post.status] }
