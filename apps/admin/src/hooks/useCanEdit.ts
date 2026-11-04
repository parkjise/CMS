import { useAuthStore } from '@/stores/authStore'

/** 보기 전용 계정(TENANT_VIEWER)이 아니면 true — 서버도 쓰기를 막는다 (T-130) */
export const useCanEdit = () => useAuthStore((s) => s.user?.role !== 'TENANT_VIEWER')

export const READ_ONLY_MESSAGE = '보기 전용 계정은 내용을 변경할 수 없습니다.'
