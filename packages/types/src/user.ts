export type UserRole = 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'TENANT_VIEWER'

export interface User {
  id: string
  tenant_id: string
  email: string
  role: UserRole
  last_login_at: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AuthTokenPayload {
  sub: string
  tenant_id: string
  role: UserRole
  is_super_admin: boolean
  exp: number
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  access_token: string
  token_type: 'bearer'
  user: User
}
