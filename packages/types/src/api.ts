export interface ApiResponse<T> {
  success: true
  data: T
  meta: {
    timestamp: string
    version: string
  }
}

export interface ApiError {
  success: false
  error: {
    code: string
    message: string
    field?: string
    details?: unknown[]
  }
}

export type ApiResult<T> = ApiResponse<T> | ApiError

export interface PaginatedData<T> {
  items: T[]
  total: number
  page: number
  size: number
  has_next: boolean
}

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FILE_TOO_LARGE'
  | 'PLAN_LIMIT_EXCEEDED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'INTERNAL_ERROR'
