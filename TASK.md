# TASK.md
# 멀티 테넌트 CMS — 전체 개발 태스크 체크리스트

> **사용법:**
> - `[ ]` = 미완료 / `[x]` = 완료 / `[~]` = 진행 중 / `[!]` = 블로킹 이슈
> - Claude에게 지시 시: `"TASK.md의 T-005 작업을 진행해줘"`
> - 완료된 태스크는 반드시 `[x]`로 업데이트
> - 각 태스크는 독립적으로 실행 가능하도록 설계됨

---

## 📊 전체 진행 현황

| 페이즈 | 태스크 수 | 완료 | 진행률 |
|---|---|---|---|
| Phase 0: 프로젝트 초기 설정 | 8 | 8 | 100% |
| Phase 1: 인프라 & DB | 7 | 3 | 42.9% |
| Phase 2: 인증 시스템 | 5 | 5 | 100% |
| Phase 3: 핵심 CRUD API | 10 | 6 | 60% |
| Phase 4: 파일 업로드 & 이미지 | 4 | 3 | 75% |
| Phase 5: 알림 시스템 | 5 | 5 | 100% |
| Phase 6: 관리자 프론트엔드 | 12 | 4 | 33.3% |
| Phase 7: 고객 홈페이지 + 홈페이지 로그인 | 10 | 0 | 0% |
| Phase 8: 템플릿 시스템 | 6 | 0 | 0% |
| Phase 9: 인라인 편집 모드 | 7 | 0 | 0% |
| Phase 10: AI 어시스턴트 | 6 | 0 | 0% |
| Phase 11: SEO & 분석 | 4 | 0 | 0% |
| Phase 12: 테스트 & 배포 | 6 | 0 | 0% |
| **Phase 13: 슈퍼 어드민 시스템** | **11** | **0** | **0%** |
| **Phase 14: SaaS 운영 시스템** | **12** | **0** | **0%** |
| **합계** | **113** | **29** | **25.7%** |

---

## Phase 0: 프로젝트 초기 설정

> **목표:** 개발 시작 전 전체 프로젝트 뼈대 구성
> **예상 소요:** 1일

---

### T-001: 모노레포 초기 구조 생성
- **담당:** 풀스택
- **참조:** `CLAUDE.md 섹션 2 (디렉토리 구조)`
- **작업 내용:**
  - [x] 루트 `package.json` 생성 (공통 스크립트: `dev`, `build`, `test`)
  - [x] `pnpm-workspace.yaml` 생성
  ```yaml
  packages:
    - 'apps/*'
    - 'packages/*'
  ```
  - [x] `apps/admin/`, `apps/client/`, `apps/backend/` 디렉토리 생성
  - [x] `packages/ui/`, `packages/types/` 디렉토리 생성
  - [x] 루트 `.gitignore` 생성 (node_modules, .env, __pycache__, .venv 등)
  - [x] 루트 `.editorconfig` 생성
- **완료 조건:** `pnpm install` 명령이 에러 없이 실행됨

---

### T-002: packages/types 초기 설정
- **담당:** 풀스택
- **참조:** `CLAUDE.md 섹션 2`, `기획서 섹션 5 (API 스펙)`
- **작업 내용:**
  - [x] `packages/types/package.json` 생성
  - [x] `packages/types/src/api.ts` — 공통 API 응답 타입
  ```typescript
  export interface ApiResponse<T> {
    success: boolean
    data: T
    meta: { timestamp: string; version: string }
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
  ```
  - [x] `packages/types/src/section.ts` — Section, SectionType, SectionSettings 타입
  - [x] `packages/types/src/inquiry.ts` — Inquiry, InquiryType, InquiryStatus 타입
  - [x] `packages/types/src/template.ts` — Template, CSSVariableSet, SectionLayoutConfig 타입
  - [x] `packages/types/src/user.ts` — User, UserRole 타입
  - [x] `packages/types/src/tenant.ts` — Tenant, PlanType, TemplateType 타입
  - [x] `packages/types/src/index.ts` — 전체 re-export
- **완료 조건:** `import { ApiResponse } from '@cms/types'` 정상 동작

---

### T-003: packages/ui 초기 설정
- **담당:** 프론트엔드
- **참조:** `CLAUDE.md 섹션 3 (기술 스택)`
- **작업 내용:**
  - [x] `packages/ui/package.json` 생성 (react 19 peer dependency)
  - [x] `packages/ui/src/Button.tsx` — variant(primary/secondary/ghost), size(sm/md/lg), loading 상태
  - [x] `packages/ui/src/Input.tsx` — label, error, helperText 포함
  - [x] `packages/ui/src/Textarea.tsx`
  - [x] `packages/ui/src/Modal.tsx` — Portal 기반, ESC 닫기
  - [x] `packages/ui/src/Toggle.tsx` — On/Off 토글 스위치
  - [x] `packages/ui/src/Toast.tsx` — sonner 기반 (success/error/warning/info)
  - [x] `packages/ui/src/Badge.tsx` — 상태 뱃지 (색상 variants)
  - [x] `packages/ui/src/Dropdown.tsx` — Select 컴포넌트
  - [x] `packages/ui/src/index.ts` — 전체 export
  - [x] TailwindCSS 4.x 설정 (공통 색상 토큰 정의)
- **완료 조건:** 각 컴포넌트 Storybook 또는 테스트 페이지에서 렌더링 확인

---

### T-004: apps/admin Vite + React 19 초기 설정
- **담당:** 프론트엔드
- **참조:** `CLAUDE.md 섹션 3`, `기획서 섹션 9`
- **작업 내용:**
  - [x] Vite 7 + React 19 + TypeScript 프로젝트 초기화
  - [x] TailwindCSS 4.x 설정 (`@tailwindcss/vite` 플러그인)
  - [x] 절대경로 alias 설정: `@/` → `src/`
  - [x] React Router 7.x 설치 및 기본 라우터 구성
  ```
  /login              ← 로그인 페이지
  /admin/dashboard    ← 대시보드 (AD-01)
  /admin/content      ← 콘텐츠 편집 (AD-02)
  /admin/sns          ← SNS 설정 (AD-03)
  /admin/inquiries    ← 문의 관리 (AD-04)
  /admin/seo          ← SEO 설정 (AD-05)
  /admin/templates    ← 템플릿 선택 (AD-06)
  ```
  - [x] TanStack Query 5.x QueryClient 설정 (`lib/queryClient.ts`)
  - [x] axios 인스턴스 설정 (`lib/api.ts`) — baseURL, 인터셉터(401 자동 refresh)
  - [x] Zustand authStore 설정 (`stores/authStore.ts`) — 토큰, 유저 정보
  - [x] PrivateRoute 컴포넌트 (비로그인 시 /login 리다이렉트)
  - [x] `apps/admin/.env.example` 생성
- **완료 조건:** `pnpm dev` 실행 시 :3001 에서 빈 화면 정상 렌더링

---

### T-005: apps/client Next.js 15 초기 설정
- **담당:** 프론트엔드
- **참조:** `CLAUDE.md 섹션 3`, `기획서 섹션 9`
- **작업 내용:**
  - [x] Next.js 15 + TypeScript App Router 초기화
  - [x] TailwindCSS 4.x 설정
  - [x] 절대경로 alias 설정
  - [x] 동적 라우트 구조 생성: `app/[tenant_slug]/page.tsx`
  - [x] Public API 클라이언트 설정 (`lib/api.ts`)
  - [x] 편집 모드 Zustand 스토어 초기 구조 (`lib/editStore.ts`)
  - [x] `apps/client/.env.example` 생성
  - [x] `next.config.ts` — 이미지 도메인 허용 (MinIO CDN)
- **완료 조건:** `pnpm dev` 실행 시 :3000 에서 Next.js 기본 페이지 렌더링

---

### T-006: apps/backend FastAPI 초기 설정
- **담당:** 백엔드
- **참조:** `CLAUDE.md 섹션 2, 3, 4`, `기획서 섹션 9`
- **작업 내용:**
  - [x] Poetry 프로젝트 초기화 (`pyproject.toml`)
  - [x] 의존성 설치 (fastapi, uvicorn, sqlalchemy, alembic, asyncpg, pydantic-settings, python-jose, bcrypt, Pillow, celery, redis, boto3, httpx, langchain-openai, pytest-asyncio)
  - [x] `app/main.py` — FastAPI 앱 생성, CORS 설정, 라우터 등록, 헬스체크
  ```python
  @app.get("/health")
  async def health(): return {"status": "ok"}
  ```
  - [x] `app/core/config.py` — pydantic-settings Settings 클래스 (모든 환경변수)
  - [x] `app/core/security.py` — JWT 생성/검증 함수
  - [x] `app/core/deps.py` — `get_db`, `get_db_with_rls`, `get_current_user`, `get_super_admin` 의존성
  - [x] `app/core/redis.py` — Redis 연결 풀
  - [x] `app/db/session.py` — AsyncSession 팩토리, RLS 컨텍스트 설정 함수
  - [x] `app/db/base.py` — SQLAlchemy Base, 공통 컬럼 Mixin
  - [x] `apps/backend/.env.example` 생성 (기획서 섹션 9.3 기준)
  - [x] `app/api/v1/router.py` — 전체 라우터 통합 파일 (엔드포인트는 이후 태스크에서 추가)
- **완료 조건:** `uvicorn app.main:app --reload` 실행 후 `/health` 200 응답 확인

---

### T-007: Docker Compose 로컬 인프라 설정
- **담당:** 백엔드/인프라
- **참조:** `기획서 섹션 9`, `CLAUDE.md 섹션 9`
- **작업 내용:**
  - [x] `docker-compose.yml` 작성
  ```yaml
  services:
    postgres:
      image: postgres:17
      environment:
        POSTGRES_DB: cms_db
        POSTGRES_USER: cms_user
        POSTGRES_PASSWORD: cms_password
      ports: ["5432:5432"]
      volumes: [postgres_data:/var/lib/postgresql/data]

    redis:
      image: redis:8-alpine
      ports: ["6379:6379"]

    minio:
      image: minio/minio:latest
      command: server /data --console-address ":9001"
      environment:
        MINIO_ROOT_USER: minioadmin
        MINIO_ROOT_PASSWORD: minioadmin
      ports: ["9000:9000", "9001:9001"]
      volumes: [minio_data:/data]
  ```
  - [x] MinIO 버킷 자동 생성 스크립트 (`scripts/init_minio.py`)
  - [x] `docker-compose.prod.yml` 기본 구조 (실제 값은 추후 채움)
- **완료 조건:** `docker compose up -d` 후 3개 서비스 모두 healthy 상태

---

### T-008: Alembic 마이그레이션 초기 설정
- **담당:** 백엔드
- **참조:** `기획서 섹션 6 (DB 스키마)`, `CLAUDE.md 섹션 6`
- **작업 내용:**
  - [x] `alembic init alembic` 실행
  - [x] `alembic/env.py` — async 엔진 설정, 모든 모델 import
  - [x] `alembic.ini` — DB URL 환경변수 참조로 수정
  - [x] 초기 마이그레이션 생성 (모든 테이블 한번에):
    - `tenants`, `users`, `sections`, `section_settings`
    - `inquiries`, `inquiry_attachments`
    - `sns_channel_settings`, `notification_settings`
    - `seo_settings`, `site_analytics`, `uploaded_files`
    - `templates`, `tenant_template_overrides`, `template_change_history`
    - `ai_usage_log`
  - [x] 각 테이블에 RLS 정책 적용 SQL 포함
  - [x] `scripts/seed.py` — 초기 데이터 삽입
    - 슈퍼 어드민 계정 (환경변수에서 읽기)
    - 기본 템플릿 6종 데이터
    - 테스트용 테넌트 1개 + 어드민 계정
- **완료 조건:** `alembic upgrade head` 성공, `scripts/seed.py` 실행 후 기본 데이터 확인

---

## Phase 1: 인프라 & DB 모델

> **목표:** SQLAlchemy ORM 모델 전체 작성
> **예상 소요:** 0.5일
> **선행 조건:** T-006, T-008 완료

---

### T-009: SQLAlchemy ORM 모델 전체 작성
- **담당:** 백엔드
- **참조:** `기획서 섹션 6 (전체 DDL)`
- **작업 내용:**
  - [x] `app/db/base.py` — Base Mixin (id, created_at, updated_at, tenant_id)
  - [x] `app/models/tenant.py` — Tenant 모델
  - [x] `app/models/user.py` — User 모델 (password_hash bcrypt)
  - [x] `app/models/section.py` — Section + SectionSettings 모델 (relationship 포함)
  - [x] `app/models/inquiry.py` — Inquiry + InquiryAttachment 모델
  - [x] `app/models/sns.py` — SnsChannelSettings + NotificationSettings 모델
  - [x] `app/models/seo.py` — SeoSettings 모델
  - [x] `app/models/analytics.py` — SiteAnalytics 모델
  - [x] `app/models/file.py` — UploadedFile 모델
  - [x] `app/models/template.py` — Template + TenantTemplateOverride + TemplateChangeHistory 모델
  - [x] `app/models/ai.py` — AiUsageLog 모델
  - [x] `app/models/__init__.py` — 전체 export
- **완료 조건:** `alembic revision --autogenerate` 실행 시 변경사항 없음 (모델과 DB 일치)

---

### T-010: Pydantic 스키마 전체 작성
- **담당:** 백엔드
- **참조:** `기획서 섹션 5 (API 스펙 요청/응답)`, `packages/types`
- **작업 내용:**
  - [x] `app/schemas/common.py` — 공통 응답 래퍼 (ApiResponse, ApiError, PaginationMeta)
  - [x] `app/schemas/auth.py` — LoginRequest, TokenResponse, UserResponse
  - [x] `app/schemas/section.py` — SectionResponse, SectionUpdate, SectionOrderUpdate, SectionSettingsUpdate
  - [x] `app/schemas/inquiry.py` — InquiryCreate(Public), InquiryResponse, InquiryUpdate, InquiryListResponse
  - [x] `app/schemas/sns.py` — SnsSettingsUpdate, SnsSettingsResponse
  - [x] `app/schemas/seo.py` — SeoSettingsUpdate, SeoSettingsResponse
  - [x] `app/schemas/template.py` — TemplateResponse, TemplateApplyRequest, TemplateCssOverrideUpdate
  - [x] `app/schemas/upload.py` — UploadResponse
  - [x] `app/schemas/ai.py` — CopySuggestRequest, CopySuggestResponse, ChatEditRequest
  - [x] `app/schemas/__init__.py`
- **완료 조건:** 모든 스키마 import 에러 없이 동작

---

## Phase 2: 인증 시스템

> **목표:** JWT 기반 로그인/로그아웃/토큰 갱신 완성
> **예상 소요:** 1일
> **선행 조건:** T-009, T-010 완료

---

### T-011: 인증 서비스 레이어 구현
- **담당:** 백엔드
- **참조:** `기획서 섹션 2.3 (인증 아키텍처)`, `CLAUDE.md 섹션 7`
- **작업 내용:**
  - [x] `app/services/auth.py` 작성
    - `authenticate_user(db, email, password, tenant_slug)` — 이메일+비밀번호+테넌트 슬러그 검증
    - `create_access_token(user)` → JWT (15분)
    - `create_refresh_token(user)` → JWT (7일)
    - `verify_token(token)` → payload 또는 예외
    - `get_user_by_id(db, user_id)`
  - [x] `app/core/security.py` — bcrypt 해싱/검증 함수
  - [x] `app/core/deps.py` 완성
    - `get_current_user` — Authorization 헤더 JWT 검증 → User 반환
    - `get_db_with_rls` — RLS 컨텍스트 설정
    - `get_super_admin` — role 검증 추가
- **완료 조건:** 단위 테스트 통과 (`tests/test_auth_service.py`)

---

### T-012: 인증 API 엔드포인트 구현
- **담당:** 백엔드
- **참조:** `기획서 섹션 5.2 (인증 API)`, `CLAUDE.md 섹션 7.2 (공유 도메인 쿠키)`
- **작업 내용:**
  - [x] `app/api/v1/endpoints/auth.py` 작성
    - `POST /api/v1/auth/login` — Access Token JSON 반환 + Refresh Token HttpOnly Cookie 발급
    - `POST /api/v1/auth/refresh` — Cookie의 Refresh Token으로 새 Access Token 발급 (rotation)
    - `POST /api/v1/auth/logout` — Refresh Token Cookie 삭제 + Redis 블랙리스트 등록
    - `GET /api/v1/auth/me` — Bearer 우선, fallback 쿠키 자동 인증
  - [x] `app/core/config.py`에 `COOKIE_DOMAIN`, `ADMIN_BASE_URL`, `CLIENT_BASE_URL` 추가
  - [x] Rate Limiting 적용: 로그인 IP당 10회/분
  - [x] CORS 설정: `ADMIN_BASE_URL` + `CLIENT_BASE_URL` 모두 허용 (`allow_credentials=True` 필수)
  - [x] `app/api/v1/router.py`에 auth 라우터 등록
- **완료 조건:** 관리자 로그인 후 고객 홈페이지에서 `/api/v1/auth/me` 호출 시 유저 정보 반환 (쿠키 공유 확인)

---

### T-013: 인증 API 테스트 작성
- **담당:** 백엔드
- **참조:** `CLAUDE.md 섹션 10 (테스트 규칙)`
- **작업 내용:**
  - [x] `tests/conftest.py` — DB 픽스처, 테스트 테넌트/유저 생성 픽스처
  - [x] `tests/test_auth.py`
    - 정상 로그인 테스트
    - 잘못된 비밀번호 테스트 (401)
    - 존재하지 않는 테넌트 테스트 (401)
    - 토큰 갱신 테스트
    - 로그아웃 후 토큰 무효화 테스트
- **완료 조건:** `pytest tests/test_auth.py -v` 전체 통과

---

### T-014: 관리자 로그인 페이지 UI 구현
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 4`, `CLAUDE.md 섹션 7.1, 7.5`
- **작업 내용:**
  - [x] `apps/admin/src/pages/LoginPage.tsx` 작성
    - 이메일, 비밀번호, 테넌트 슬러그 입력 폼
    - react-hook-form + zod 유효성 검사
    - 로그인 실패 시 에러 메시지 표시
    - 로그인 성공 시 `/admin/dashboard` 리다이렉트
  - [x] `apps/admin/src/stores/authStore.ts` 완성
    - accessToken, user 상태
    - `login()`, `logout()`, `refreshToken()` 액션
    - `initialize()` — 앱 시작 시 `/api/v1/auth/me` 호출로 쿠키 기반 자동 로그인 확인
  - [x] axios 인터셉터 완성 — 401 응답 시 자동 토큰 refresh 후 재요청
  - [x] `apps/admin/src/hooks/useAuth.ts` — authStore 래퍼 훅
  - [x] 관리자 헤더에 [내 홈페이지 바로가기 ↗] 버튼 추가
    - 클릭 시 `CLIENT_BASE_URL/{tenant_slug}` 새 탭 오픈
    - 이미 로그인된 쿠키가 공유되므로 홈페이지에서 편집 버튼 바로 노출
- **완료 조건:** 관리자 로그인 성공 후 [내 홈페이지 바로가기] 클릭 시 홈페이지에서 ✏️ 편집 버튼 자동 노출

---

### T-015: 공통 레이아웃 컴포넌트 구현
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 4 (AD-01 화면 설계)`
- **작업 내용:**
  - [x] `apps/admin/src/components/layout/AdminLayout.tsx`
    - 사이드바 네비게이션 (아이콘 + 레이블)
    - 상단 헤더 (테넌트명, 플랜 표시, 로그아웃)
    - 메인 콘텐츠 영역
    - 모바일 반응형 (햄버거 메뉴)
  - [x] `apps/admin/src/components/layout/Sidebar.tsx` — 메뉴 항목 active 상태
  - [x] PrivateRoute로 AdminLayout 감싸기
- **완료 조건:** 모든 관리자 페이지에서 사이드바/헤더 정상 노출

---

## Phase 3: 핵심 CRUD API

> **목표:** 섹션, 문의, SNS, SEO API 완성
> **예상 소요:** 3일
> **선행 조건:** T-011 완료

---

### T-016: 섹션 서비스 + API 구현 ✅
- **담당:** 백엔드
- **참조:** `기획서 섹션 5.3 (섹션/콘텐츠 API)`
- **작업 내용:**
  - [x] `app/services/section.py`
    - `get_sections(db, tenant_id)` — 순서 정렬하여 반환
    - `get_section_by_id(db, section_id)`
    - `update_section_settings(db, section_id, data)` — section_settings Key-Value 업데이트
    - `update_sections_order(db, tenant_id, order_list)` — 순서 일괄 변경
    - `toggle_section(db, section_id, is_active)`
    - `create_default_sections(db, tenant_id, template_type)` — 신규 테넌트 기본 섹션 생성
  - [x] `app/api/v1/endpoints/sections.py`
    - `GET /api/v1/sections` — 목록 조회
    - `GET /api/v1/sections/{id}` — 단건 조회
    - `PATCH /api/v1/sections/{id}` — 설정 수정 (Validation: main_title 40자 등)
    - `PATCH /api/v1/sections/order` — 순서 일괄 변경
    - `PATCH /api/v1/sections/{id}/toggle` — 활성화/비활성화
  - [x] Redis 캐시 적용 (섹션 조회 5분 캐시, 수정 시 캐시 무효화)
- **완료 조건:** `tests/test_sections.py` 전체 통과, Swagger UI 동작 확인

---

### T-017: 문의 서비스 + API 구현 ✅
- **담당:** 백엔드
- **참조:** `기획서 섹션 5.5 (문의 API)`
- **작업 내용:**
  - [x] `app/services/inquiry.py`
    - `create_inquiry(db, tenant_id, data)` — 문의 생성 + 알림 트리거
    - `get_inquiries(db, tenant_id, filters, pagination)` — 필터·페이지네이션
    - `get_inquiry_by_id(db, inquiry_id)`
    - `update_inquiry(db, inquiry_id, data)` — 상태 변경, 메모 저장
    - `get_pending_count(db, tenant_id)` — 대기 중 문의 수
  - [x] `app/api/v1/endpoints/inquiries.py`
    - `POST /api/public/inquiries` — 공개 문의 접수 (인증 불필요, reCAPTCHA 검증)
    - `GET /api/v1/inquiries` — 관리자 목록 조회 (필터, 페이지네이션)
    - `GET /api/v1/inquiries/{id}` — 상세 조회
    - `PATCH /api/v1/inquiries/{id}` — 상태/메모 수정
    - `DELETE /api/v1/inquiries/{id}` — 소프트 삭제
    - `GET /api/v1/inquiries/export` — 엑셀 다운로드 (openpyxl)
  - [x] IP 기반 Rate Limiting (1분 3회)
  - [x] 스팸 방지: reCAPTCHA v3 검증 함수
- **완료 조건:** `tests/test_inquiries.py` 전체 통과

---

### T-018: SNS 설정 API 구현 ✅
- **담당:** 백엔드
- **참조:** `기획서 섹션 5.6 (SNS 설정 API)`
- **작업 내용:**
  - [x] `app/services/sns.py`
    - `get_sns_settings(db, tenant_id)`
    - `update_sns_settings(db, tenant_id, data)`
    - `test_url_validity(url)` — httpx로 HEAD 요청, 3초 타임아웃
  - [x] `app/api/v1/endpoints/sns.py`
    - `GET /api/v1/sns-settings`
    - `PUT /api/v1/sns-settings`
    - `POST /api/v1/sns-settings/test-url`
  - [x] 플랜별 채널 수 제한 (BASIC: 2개, STANDARD: 4개, PREMIUM: 무제한)
- **완료 조건:** Swagger UI에서 SNS 설정 저장/조회 동작 확인

---

### T-019: SEO 설정 API 구현 ✅
- **담당:** 백엔드
- **참조:** `기획서 섹션 5.7 (SEO API)`
- **작업 내용:**
  - [x] `app/services/seo.py`
    - `get_seo_settings(db, tenant_id)`
    - `update_seo_settings(db, tenant_id, data)`
    - `generate_sitemap_xml(tenant_id)` — 사이트맵 XML 자동 생성
  - [x] `app/api/v1/endpoints/seo.py`
    - `GET /api/v1/seo-settings`
    - `PUT /api/v1/seo-settings`
    - `GET /api/public/sitemap/{tenant_slug}.xml` — 사이트맵 공개 엔드포인트
  - [x] 페이지 제목 60자, 메타 설명 160자 Validation
- **완료 조건:** SEO 설정 저장 후 사이트맵 XML 정상 반환 확인

---

### T-020: 공개 사이트 API 구현 ✅
- **담당:** 백엔드
- **참조:** `기획서 섹션 2.1 (Public Site API Server)`
- **작업 내용:**
  - [x] `app/api/v1/endpoints/public.py`
    - `GET /api/public/site/{tenant_slug}` — 테넌트 전체 사이트 데이터 반환
    - `GET /api/public/site/{tenant_slug}/sections` — 섹션 데이터만
  - [x] Redis 캐시 10분 (고객 홈페이지 로딩 최적화)
  - [x] 비활성 테넌트 접근 시 404 처리
- **완료 조건:** `/api/public/site/{slug}` 호출 시 전체 사이트 데이터 반환

---

### T-021: 대시보드 통계 API 구현
- **담당:** 백엔드
- **참조:** `기획서 섹션 4 (AD-01 대시보드)`
- **작업 내용:**
  - [x] `app/api/v1/endpoints/dashboard.py`
    - `GET /api/v1/dashboard/stats` — 오늘 방문자, 이번주 방문자, 신규 문의 수, 미처리 문의 수
    - `GET /api/v1/dashboard/chart` — 최근 7일 방문자 Line Chart 데이터
    - `GET /api/v1/dashboard/recent-inquiries` — 최근 미확인 문의 5건
  - [x] SSE 엔드포인트 (`GET /api/v1/notifications/stream`) — 실시간 신규 문의 알림
  - [x] Redis Pub/Sub 구독/발행 로직
- **완료 조건:** 대시보드 API 응답 데이터 형식 확인

---

### T-022: 배치 저장 API 구현 (인라인 편집용)
- **담당:** 백엔드
- **참조:** `기획서 섹션 12.5 (POST /edit/batch-save)`
- **작업 내용:**
  - [x] `app/api/v1/endpoints/edit.py`
    - `POST /api/v1/edit/batch-save` — 변경사항 배열 일괄 저장
    - 각 변경사항 Validation (필드별 최대 길이 검증)
    - 부분 실패 허용 (saved_count, failed_count 반환)
    - 저장 후 Redis 캐시 퍼지
- **완료 조건:** 여러 섹션 변경사항을 한 번에 저장하는 통합 테스트 통과

---

### T-023: 슈퍼 어드민 기반 API 구조 설정
- **담당:** 백엔드
- **참조:** `기획서 섹션 14.6`, `CLAUDE.md 섹션 8.1`
- **작업 내용:**
  - [x] `app/api/super/` 디렉토리 생성 (일반 /api/v1/과 완전 분리)
  - [x] `app/api/super/router.py` — 슈퍼 어드민 라우터 통합
  - [x] `app/core/deps.py`에 `get_super_admin` 의존성 완성
    - SUPER_ADMIN role 검증 + 2FA 검증 (추후 추가)
    - 모든 슈퍼 어드민 API에 자동 적용
  - [x] `app/core/audit.py` — 감사 로그 자동 기록 함수
    ```python
    async def log_action(db, actor, action, target_type, target_id, before, after)
    ```
  - [x] `app/main.py`에 슈퍼 어드민 라우터 등록
    - prefix: `/api/super/v1`
    - 미들웨어: IP 화이트리스트 (선택, 환경변수로 관리)
- **완료 조건:** `/api/super/v1/health` 엔드포인트 SUPER_ADMIN 토큰으로만 200 응답

---

### T-024: 분석 데이터 수집 API
- **담당:** 백엔드
- **참조:** `기획서 섹션 10 (오픈 이슈 #1)`, `기획서 AD-01`
- **작업 내용:**
  - [x] `app/api/v1/endpoints/analytics.py`
    - `POST /api/public/analytics/pageview` — 페이지뷰 수집 (1px 비콘 방식)
    - UA 파싱으로 모바일/데스크톱 구분
    - IP 기반 중복 제거 (Redis로 일별 유니크 방문자)
    - 1시간마다 Redis → PostgreSQL 집계 저장 (Celery 태스크)
  - [x] `GET /api/v1/analytics/summary` — 대시보드용 통계 요약
- **완료 조건:** 페이지뷰 수집 → 대시보드에서 방문자 수 정상 노출

---

### T-025: CRUD API 통합 테스트
- **담당:** 백엔드
- **참조:** `CLAUDE.md 섹션 10`
- **작업 내용:**
  - [x] `tests/test_sections.py` — 섹션 CRUD, 순서 변경, 토글 전체 테스트
  - [x] `tests/test_inquiries.py` — 문의 접수, 조회, 상태 변경, 스팸 방지 테스트
  - [x] `tests/test_public.py` — 공개 API, RLS 격리 검증 테스트
  - [x] `tests/test_rls.py` — 테넌트 A가 테넌트 B 데이터 접근 시도 → 403 확인
- **완료 조건:** `pytest tests/ -v` 전체 통과, 커버리지 70% 이상

---

## Phase 4: 파일 업로드 & 이미지 최적화

> **목표:** 이미지 업로드 + Pillow WebP 최적화 파이프라인 완성
> **예상 소요:** 1일
> **선행 조건:** T-007 (MinIO), T-009 완료

---

### T-026: 이미지 처리 서비스 구현
- **담당:** 백엔드
- **참조:** `기획서 섹션 5.4 (파일 업로드 API)`, `기획서 섹션 7 (이미지 처리 플로우)`
- **작업 내용:**
  - [x] `app/services/image.py`
    - `optimize_image(file_bytes)` — Pillow WebP 변환 (quality=82, max 1920px, EXIF 회전 보정)
    - `validate_image(file)` — MIME 타입 magic bytes 검증, 20MB 제한
    - `upload_to_storage(bytes, path)` — MinIO/S3 업로드
    - `delete_from_storage(path)` — 파일 삭제
    - `get_cdn_url(path)` — CDN URL 생성
  - [x] `app/api/v1/endpoints/upload.py`
    - `POST /api/v1/upload/image` — multipart/form-data 수신 → 최적화 → MinIO 업로드
    - 응답: `{url, original_size_kb, optimized_size_kb, width, height, format}`
    - 저장 경로: `/{tenant_id}/{context}/{section_id}/{uuid}.webp`
  - [x] `uploaded_files` 테이블 DB 기록
  - [x] 스토리지 용량 한도 체크 (플랜별: 1GB/5GB/20GB)
- **완료 조건:** 5MB 이상 JPG 업로드 시 WebP로 변환되어 용량 감소 확인

---

### T-027: 갤러리 이미지 다중 업로드
- **담당:** 백엔드
- **참조:** `기획서 섹션 12.4 (갤러리 이미지 편집)`
- **작업 내용:**
  - [x] `gallery_items` 테이블 추가 마이그레이션
  - [x] `POST /api/v1/upload/gallery` — 다중 파일 업로드 (최대 10개 동시)
  - [x] `GET /api/v1/gallery/{section_id}` — 갤러리 아이템 목록
  - [x] `DELETE /api/v1/gallery/{item_id}` — 갤러리 아이템 삭제 + 파일 삭제
  - [x] `PATCH /api/v1/gallery/order` — 갤러리 이미지 순서 변경
- **완료 조건:** 다중 이미지 업로드 후 갤러리 섹션에 정상 표시

---

### T-028: 프론트엔드 이미지 업로드 컴포넌트
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 4 (AD-02-B 이미지 업로드)`
- **작업 내용:**
  - [ ] `packages/ui/src/ImageUpload.tsx`
    - 드래그앤드롭 + 파일 선택 버튼
    - 업로드 진행률 표시 (axios onUploadProgress)
    - 최적화 결과 표시 ("8.2MB → 340KB로 최적화")
    - 현재 이미지 미리보기 + 삭제 버튼
  - [ ] 파일 타입/크기 클라이언트 검증 (20MB 이상 즉시 에러)
- **완료 조건:** 이미지 드래그앤드롭 → 업로드 → 최적화 결과 표시

---

### T-029: Celery 이미지 후처리 태스크
- **담당:** 백엔드
- **참조:** `기획서 섹션 9 (Celery)`
- **작업 내용:**
  - [x] `app/workers/celery_app.py` — Celery 앱 초기화 (Redis 브로커)
  - [x] `app/workers/image.py`
    - `generate_thumbnail` 태스크 — 썸네일 자동 생성 (400x300)
    - `cleanup_orphan_files` 태스크 — 미사용 파일 주기적 정리 (매일 새벽 3시)
- **완료 조건:** Celery 워커 실행 후 업로드 완료 시 썸네일 자동 생성 확인

---

## Phase 5: 알림 시스템

> **목표:** 카카오 알림톡/SMS 비동기 발송 완성
> **예상 소요:** 1.5일
> **선행 조건:** T-027, T-029 완료

---

### T-030: 알림 설정 API 구현
- **담당:** 백엔드
- **참조:** `기획서 섹션 4 (AD-03 알림 채널 설정)`
- **작업 내용:**
  - [x] `app/api/v1/endpoints/notifications.py`
    - `GET /api/v1/notification-settings`
    - `PUT /api/v1/notification-settings`
    - `POST /api/v1/notification-settings/test` — 테스트 알림 발송
  - [x] 전화번호 형식 검증 (한국 휴대폰 번호 정규식)
  - [x] 월간 발송 카운터 조회 및 표시
- **완료 조건:** 알림 설정 저장 후 테스트 알림 발송 동작 확인

---

### T-031: 카카오 알림톡 / SMS 발송 서비스 구현
- **담당:** 백엔드
- **참조:** `기획서 섹션 7.1 (카카오 알림톡 발송)`
- **작업 내용:**
  - [x] `app/services/notification.py`
    - `send_kakao_alimtalk(to, template_code, variables)` — 네이버 클라우드 SENS API 호출
    - `send_sms(to, message)` — SMS 발송
    - `check_monthly_limit(tenant_id)` — 플랜별 월 한도 초과 체크
    - `increment_monthly_count(tenant_id)` — 발송 카운터 증가
    - `mask_phone(phone)` — 010-1234-5678 → 010-****-5678
  - [x] 알림톡 실패 시 SMS 자동 fallback 로직
  - [x] 네이버 클라우드 SENS API 연동 (테스트 모드/실제 모드 분리)
- **완료 조건:** 테스트 알림 발송 시 실제 카카오톡 수신 확인

---

### T-032: 알림 Celery 태스크 구현
- **담당:** 백엔드
- **참조:** `기획서 섹션 7.1 (Celery 코드)`
- **작업 내용:**
  - [x] `app/workers/notification.py`
    - `send_inquiry_alert` 태스크 — 문의 접수 알림 비동기 발송
    - 재시도 3회, 지수 백오프
    - 발송 완료 후 `inquiries.is_notified = True` 업데이트
  - [x] 문의 접수 엔드포인트에서 태스크 트리거 연동
  - [x] Redis Pub/Sub publish 연동 (SSE 실시간 알림)
- **완료 조건:** 문의 접수 → 30초 내 알림톡 수신

---

### T-033: SSE 실시간 알림 프론트엔드 연동
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 7.3 (SSE 실시간 알림)`
- **작업 내용:**
  - [x] `apps/admin/src/hooks/useSSENotifications.ts`
    - EventSource 연결 (`/api/v1/notifications/stream`)
    - 신규 문의 수신 시 대시보드 카운터 자동 업데이트
    - 연결 끊김 시 자동 재연결 (3초 후)
    - 브라우저 Notification API 권한 요청 + 알림 표시
  - [x] 대시보드 미확인 문의 목록 실시간 갱신
- **완료 조건:** 새 문의 접수 시 관리자 브라우저에 실시간 알림 표시

---

### T-034: 월간 발송 한도 초기화 Celery 태스크
- **담당:** 백엔드
- **참조:** `기획서 섹션 3.2 (플랜별 알림 한도)`
- **작업 내용:**
  - [x] `app/workers/scheduled.py`
    - `reset_monthly_notification_count` — 매월 1일 00:00 전체 테넌트 카운터 초기화
    - `cleanup_old_inquiries` — 플랜별 보관 기간 초과 문의 소프트 삭제
    - `cleanup_old_analytics` — 플랜별 보관 기간 초과 통계 삭제
  - [x] Celery Beat 스케줄러 설정
- **완료 조건:** Celery Beat 실행 후 스케줄 태스크 정상 등록 확인

---

## Phase 6: 관리자 프론트엔드 (apps/admin)

> **목표:** 기획서 AD-01 ~ AD-06 화면 전체 구현
> **예상 소요:** 5일
> **선행 조건:** T-014, T-015, Phase 3 API 완료

---

### T-035: 대시보드 페이지 구현 (AD-01)
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 4 (AD-01)`
- **작업 내용:**
  - [x] `apps/admin/src/pages/DashboardPage.tsx`
  - [x] 통계 카드 컴포넌트 (오늘 방문자, 이번주 방문자, 신규 문의, 미처리 문의)
  - [x] Recharts Line Chart (7일 방문자 추이)
  - [x] 미확인 문의 목록 (클릭 시 AD-04로 이동)
  - [x] `useSSENotifications` 훅 연동 (실시간 카운터 업데이트)
  - [x] 스켈레톤 로딩 UI
- **완료 조건:** 대시보드 모든 위젯 데이터 정상 노출, 실시간 알림 동작

---

### T-036: 콘텐츠 편집기 구현 - 섹션 목록 (AD-02-A)
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 4 (AD-02-A)`
- **작업 내용:**
  - [x] `apps/admin/src/pages/ContentPage.tsx`
  - [x] 섹션 목록 + 활성화 토글
  - [x] `@dnd-kit/react` 드래그앤드롭 (--legacy-peer-deps)
  - [x] 낙관적 업데이트 (순서 변경 즉시 UI 반영, API 실패 시 롤백)
  - [x] 섹션 유형별 아이콘 표시
  - [x] 탭 구조: [섹션 관리] [공통 설정]
- **완료 조건:** 드래그로 섹션 순서 변경 후 새로고침해도 유지

---

### T-037: 콘텐츠 편집기 구현 - 섹션 상세 편집 (AD-02-B)
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 4 (AD-02-B)`
- **작업 내용:**
  - [x] 섹션 유형별 편집 폼 컴포넌트 (6종)
    - `HeroBannerForm.tsx` — 타이틀(40자), 서브카피(80자), 배경이미지, CTA 버튼
    - `IntroForm.tsx` — 소개 텍스트, 이미지
    - `ServicesForm.tsx` — 서비스 항목 리스트 (추가/삭제)
    - `GalleryForm.tsx` — 다중 이미지 업로드
    - `MapForm.tsx` — 주소 입력 (카카오 지도 API 연동)
    - `ContactForm.tsx` — 폼 필드 설정
  - [x] 글자 수 실시간 카운터 (초과 시 빨간색)
  - [x] ImageUpload 컴포넌트 연동
  - [x] [기본 설정] [모바일 설정] 탭 구조
  - [x] 변경 시 자동 저장 방지 + [변경사항 저장] 버튼
- **완료 조건:** 각 섹션 편집 후 저장 시 홈페이지에 즉시 반영

---

### T-038: SNS 연동 설정 페이지 구현 (AD-03)
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 4 (AD-03)`
- **작업 내용:**
  - [x] `apps/admin/src/pages/SnsPage.tsx`
  - [x] SNS 채널 목록 (인스타그램, 네이버 블로그, 카카오, 유튜브, 페이스북)
  - [x] URL 입력 + 연결 테스트 버튼 (API 호출 후 결과 표시)
  - [x] 활성화 토글 (URL 없으면 토글 비활성화)
  - [x] 노출 위치 체크박스 (푸터, 플로팅)
  - [x] 알림 채널 설정 (카카오/SMS/이메일 + 전화번호 인증)
  - [x] 이번 달 발송 현황 프로그레스 바
- **완료 조건:** SNS 설정 저장 후 고객 홈페이지 푸터에 아이콘 자동 노출

---

### T-039: 문의 관리 페이지 구현 (AD-04)
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 4 (AD-04)`
- **작업 내용:**
  - [ ] `apps/admin/src/pages/InquiriesPage.tsx`
  - [ ] 검색 필터 (날짜 피커, 유형, 상태)
  - [ ] 데이터 테이블 (정렬, 페이지네이션)
  - [ ] 상태 변경 드롭다운 (인라인)
  - [ ] 상세보기 모달 (AD-04-M)
    - 문의자 정보 + 연락처 클립보드 복사
    - 문의 내용 전체 노출
    - 관리자 메모 Textarea
    - [삭제] [저장] 버튼
  - [ ] 엑셀 내보내기 버튼
  - [ ] 미처리 문의 수 빨간 뱃지 (AD-01 대시보드와 공유)
- **완료 조건:** 문의 목록 조회, 상태 변경, 메모 저장 전체 동작

---

### T-040: SEO 설정 마법사 구현 (AD-05)
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 4 (AD-05)`
- **작업 내용:**
  - [ ] `apps/admin/src/pages/SeoPage.tsx`
  - [ ] 탭 구조: [기본 SEO] [소셜 미리보기] [사이트맵] [분석]
  - [ ] 검색결과 실시간 미리보기 (Google 스니펫 스타일)
  - [ ] 글자 수 실시간 카운터 (제목 60자, 설명 160자)
  - [ ] 키워드 태그 입력 (엔터로 추가, × 버튼으로 삭제)
  - [ ] OG 이미지 업로드
  - [ ] BASIC 플랜: 일부 기능 잠금 + 업그레이드 안내
- **완료 조건:** SEO 설정 저장 후 공개 홈페이지 메타태그 반영 확인

---

### T-041: 요금제 페이지 구현
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 3.2 (요금제 플랜)`
- **작업 내용:**
  - [ ] `apps/admin/src/pages/BillingPage.tsx`
  - [ ] 현재 플랜 표시 + 기능 사용 현황 (문의 수, 스토리지 용량, 알림 발송 수)
  - [ ] 플랜 비교 테이블 (BASIC / STANDARD / PREMIUM)
  - [ ] 업그레이드 버튼 (실제 결제는 추후 구현, 현재는 문의하기 연결)
- **완료 조건:** 현재 플랜 및 사용 현황 정상 표시

---

### T-042: 공통 에러 처리 UI
- **담당:** 프론트엔드
- **참조:** `CLAUDE.md 섹션 5 (에러 코드 표준)`
- **작업 내용:**
  - [ ] axios 에러 인터셉터 완성 (API 에러 코드별 토스트 메시지)
  - [ ] 전역 에러 바운더리 컴포넌트
  - [ ] 404/403/500 에러 페이지
  - [ ] 네트워크 오프라인 감지 + 안내 배너
  - [ ] 폼 필드 에러 메시지 표시 (서버 검증 에러 → 해당 필드 하이라이트)
- **완료 조건:** API 에러 발생 시 적절한 UI 피드백 표시

---

### T-043: 관리자 반응형 최적화
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 8.1 (성능 목표)`
- **작업 내용:**
  - [ ] 모바일 (768px 미만): 사이드바 → 하단 탭바로 전환
  - [ ] 태블릿 (1024px 미만): 사이드바 축소 (아이콘만)
  - [ ] 데이터 테이블 모바일: 카드 레이아웃으로 전환
  - [ ] Lighthouse 성능 점수 90점 이상 목표
- **완료 조건:** 모바일에서 모든 관리자 기능 사용 가능

---

### T-044: 관리자 접근성 (a11y) 기본 적용
- **담당:** 프론트엔드
- **작업 내용:**
  - [ ] 모든 인터랙티브 요소 키보드 접근 가능
  - [ ] 이미지 alt 텍스트
  - [ ] 폼 레이블 연결
  - [ ] 색상 대비율 WCAG AA 준수
- **완료 조건:** axe DevTools 심각 오류 0개

---

### T-045: 관리자 프론트엔드 Vitest 테스트
- **담당:** 프론트엔드
- **작업 내용:**
  - [ ] `apps/admin/src/__tests__/` 디렉토리 생성
  - [ ] 인증 스토어 단위 테스트
  - [ ] 섹션 편집 폼 유효성 검사 테스트
  - [ ] API 목킹 (msw) 설정
- **완료 조건:** `pnpm test` 전체 통과

---

### T-046: 관리자 빌드 최적화
- **담당:** 프론트엔드
- **작업 내용:**
  - [ ] Code Splitting — 페이지별 lazy loading
  - [ ] 번들 크기 분석 (`vite-bundle-visualizer`)
  - [ ] 초기 번들 500KB 미만 목표
- **완료 조건:** `pnpm build` 성공, 번들 크기 목표 달성

---

## Phase 7: 고객 홈페이지 (apps/client)

> **목표:** 테넌트별 홈페이지 SSR 렌더링 완성
> **예상 소요:** 3일
> **선행 조건:** T-020 (Public API), T-037 (섹션 컴포넌트 참조)

---

### T-047: 고객 홈페이지 기본 구조
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 2.1 (앱/client)`, `기획서 섹션 11 (템플릿)`
- **작업 내용:**
  - [ ] `app/[tenant_slug]/page.tsx` — SSR로 Public API 데이터 fetch
  - [ ] `app/[tenant_slug]/layout.tsx` — SEO 메타태그 동적 주입
    ```typescript
    export async function generateMetadata({ params }) {
      const seo = await fetchSeoSettings(params.tenant_slug)
      return { title: seo.page_title, description: seo.meta_description, ... }
    }
    ```
  - [ ] 비활성 테넌트 접근 시 404 페이지
  - [ ] 로딩 스켈레톤 (`loading.tsx`)
- **완료 조건:** `/{tenant_slug}` 접속 시 해당 테넌트 홈페이지 SSR 렌더링

---

### T-048: 섹션 컴포넌트 구현 (6종)
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 11.2 (템플릿 목록)`, `기획서 AD-02-B`
- **작업 내용:**
  - [ ] `apps/client/components/sections/HeroBanner.tsx`
  - [ ] `apps/client/components/sections/Intro.tsx`
  - [ ] `apps/client/components/sections/Services.tsx`
  - [ ] `apps/client/components/sections/Gallery.tsx` (이미지 갤러리)
  - [ ] `apps/client/components/sections/ContactForm.tsx` (문의 폼 → Public API 제출)
  - [ ] `apps/client/components/sections/Map.tsx` (카카오 지도 SDK)
  - [ ] 각 컴포넌트 — `data-editable`, `data-field`, `data-section-id` 속성 부착
  - [ ] `SectionRenderer.tsx` — section_type에 따라 동적 컴포넌트 렌더링
- **완료 조건:** 모든 섹션 타입 정상 렌더링, 모바일 반응형

---

### T-049: 공통 레이아웃 컴포넌트 (네비게이션, 푸터, 플로팅 버튼)
- **담당:** 프론트엔드
- **참조:** `CLAUDE.md 섹션 7.3 (홈페이지 편집 모드 진입 흐름)`
- **작업 내용:**
  - [ ] `apps/client/components/layout/Navbar.tsx`
    - 로고, 메뉴 항목 (섹션 앵커 링크)
    - 스크롤 시 sticky 전환
    - 모바일 햄버거 메뉴
  - [ ] `apps/client/components/layout/Footer.tsx`
    - SNS 채널 아이콘 (설정에 따라 동적 노출)
    - 사업자 정보
  - [ ] `apps/client/components/layout/FloatingButtons.tsx`
    - 카카오톡 채널 플로팅 버튼 (SNS 설정에서 활성화 시)
    - 맨 위로 버튼
    - **인증 상태에 따라 동적 버튼 노출** ← 핵심
      ```
      isLoggedIn = false → 🔐 [관리자 로그인] 버튼 노출
                              클릭 시 로그인 모달 오픈
      isLoggedIn = true  → ✏️ [편집 모드] 버튼 노출
                              클릭 시 인라인 편집 모드 진입
      isEditMode = true  → [편집 종료] 버튼으로 교체
      ```
    - `authStore.initialize()` 호출로 쿠키 기반 자동 로그인 확인
- **완료 조건:**
  - 비로그인: 🔐 로그인 버튼 노출 → 로그인 성공 → ✏️ 편집 버튼으로 교체
  - admin에서 로그인 후 홈페이지 접속: ✏️ 편집 버튼 바로 노출 (재로그인 불필요)

---

### T-050: CSS 변수 기반 테마 시스템 구현
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 11.3 (템플릿 데이터 구조)`, `CSSVariableSet`
- **작업 내용:**
  - [ ] `apps/client/lib/theme.ts` — CSS 변수 → `document.documentElement.style` 주입 함수
  - [ ] SSR 시 `<head>`에 CSS 변수 인라인 삽입 (FOUC 방지)
  ```typescript
  // layout.tsx에서 스타일 주입
  const cssVarString = buildCSSVariableString(template.css_variables, overrides)
  // <style>{`:root { ${cssVarString} }`}</style>
  ```
  - [ ] TailwindCSS 4.x CSS 변수 연동 (`--color-primary` → Tailwind 클래스)
  - [ ] 섹션 컴포넌트 전체를 CSS 변수 기반으로 리팩토링
- **완료 조건:** 템플릿 변경 시 CSS 변수만 교체되어 전체 디자인 변경

---

### T-051: 고객 문의 폼 + reCAPTCHA
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 5.5 (POST /inquiries)`
- **작업 내용:**
  - [ ] `apps/client/components/sections/ContactForm.tsx`
    - 이름, 연락처, 이메일(선택), 문의 내용 필드
    - react-hook-form + zod 유효성 검사
    - reCAPTCHA v3 비표시 검증
    - 제출 성공/실패 피드백
  - [ ] 문의 유형별 폼 필드 커스터마이징 (병원: 증상 선택 등)
- **완료 조건:** 문의 제출 → 관리자 알림 수신 → 관리자 페이지 목록 노출

---

### T-052: 홈페이지 성능 최적화
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 8.1 (성능 목표 LCP ≤ 2초)`
- **작업 내용:**
  - [ ] 이미지 `next/image` 컴포넌트 적용 (WebP 자동, lazy loading)
  - [ ] 섹션별 Suspense + 스켈레톤
  - [ ] 폰트 최적화 (`next/font` + Noto Sans KR, Pretendard)
  - [ ] Critical CSS 인라인
  - [ ] Lighthouse LCP 2초 이하, CLS 0.1 이하 목표
- **완료 조건:** Lighthouse 성능 점수 90점 이상

---

### T-053: 사이트맵 + 로봇 텍스트
- **담당:** 프론트엔드/백엔드
- **참조:** `기획서 섹션 5.7 (SEO)`
- **작업 내용:**
  - [ ] `app/sitemap.ts` — Next.js 동적 사이트맵 생성
  - [ ] `app/robots.ts` — robots.txt 동적 생성
  - [ ] 구조화 데이터 (JSON-LD) — LocalBusiness 스키마 (병원, 펜션 등)
- **완료 조건:** `/sitemap.xml`, `/robots.txt` 정상 응답

---

### T-054: 고객 홈페이지 통합 테스트
- **담당:** 프론트엔드
- **작업 내용:**
  - [ ] Playwright E2E 테스트 설정
  - [ ] 테넌트 홈페이지 접속 → 섹션 렌더링 → 문의 제출 플로우 테스트
  - [ ] SEO 메타태그 주입 확인 테스트
- **완료 조건:** E2E 테스트 전체 통과

---

### T-054-A: 홈페이지 로그인 컴포넌트 구현 ★신규
- **담당:** 프론트엔드
- **참조:** `CLAUDE.md 섹션 7.1, 7.3, 7.7`
- **작업 내용:**
  - [ ] `apps/client/lib/authStore.ts` 완성 (CLAUDE.md 섹션 7.7 참조)
    - `initialize()` — 페이지 로드 시 `GET /api/v1/auth/me` 호출 (쿠키 자동 전송)
    - `login()`, `logout()`, `toggleEditMode()` 액션
  - [ ] `apps/client/components/auth/LoginModal.tsx`
    - 이메일, 비밀번호 입력 폼 (테넌트 슬러그는 URL에서 자동 추출)
    - 로그인 성공 시 모달 닫기 + ✏️ 편집 버튼 노출
    - 로그인 실패 시 에러 메시지
    - [관리자 페이지로 이동 →] 링크 (admin URL로 이동)
  - [ ] `apps/client/components/auth/LoginPage.tsx`
    - `/[tenant_slug]/login` 전용 페이지 (모달 대신 전체 페이지 로그인)
    - 모바일 UX 고려
    - 로그인 성공 시 홈페이지(`/[tenant_slug]`)로 리다이렉트
  - [ ] `apps/[tenant_slug]/layout.tsx`에서 `authStore.initialize()` 호출
    - 페이지 로드 시 자동으로 쿠키 확인 → 로그인 상태 복원
- **완료 조건:**
  - 홈페이지에서 직접 로그인 가능
  - admin에서 로그인 후 홈페이지 접속 시 재로그인 없이 편집 버튼 노출
  - 로그아웃 시 양쪽(admin, client) 모두 로그인 상태 해제

---

### T-054-B: 관리자↔홈페이지 연결 UX 구현 ★신규
- **담당:** 프론트엔드
- **참조:** `CLAUDE.md 섹션 7.4`
- **작업 내용:**
  - [ ] `apps/admin` 헤더에 [내 홈페이지 열기 ↗] 버튼
    - 클릭 시 `{CLIENT_BASE_URL}/{tenant_slug}` 새 탭 오픈
    - 이미 로그인된 쿠키 공유 → 홈페이지에서 ✏️ 편집 버튼 바로 노출
  - [ ] `apps/client` 편집 툴바에 [관리자 페이지 →] 버튼
    - 클릭 시 `{ADMIN_BASE_URL}/admin/dashboard` 새 탭 오픈
  - [ ] `apps/client` 편집 모드 종료 시 확인 다이얼로그
    - "저장되지 않은 변경사항이 있습니다. 저장하고 종료하시겠습니까?"
    - [저장 후 종료] [그냥 종료] [취소]
- **완료 조건:**
  - 관리자 페이지 ↔ 홈페이지 인라인 편집 간 자연스러운 이동
  - 어느 쪽에서 수정해도 홈페이지에 즉시 반영 확인

---

## Phase 8: 템플릿 선택 시스템

> **목표:** 템플릿 선택 + 커스터마이징 + 롤백 완성
> **예상 소요:** 2일
> **선행 조건:** T-050 완료

---

### T-055: 템플릿 서비스 + API 구현
- **담당:** 백엔드
- **참조:** `기획서 섹션 11.5 (템플릿 API)`
- **작업 내용:**
  - [ ] `app/services/template.py`
    - `get_available_templates(plan_type, industry)` — 플랜·업종 필터링
    - `apply_template(db, tenant_id, template_id)` — 스냅샷 저장 + 템플릿 적용
    - `rollback_template(db, tenant_id)` — 이전 상태 복구
    - `customize_template(db, tenant_id, css_overrides)` — CSS 변수 개별 수정
  - [ ] `app/api/v1/endpoints/templates.py`
    - `GET /api/v1/templates` — 목록 조회
    - `POST /api/v1/templates/apply` — 템플릿 적용
    - `POST /api/v1/templates/rollback` — 롤백
    - `PATCH /api/v1/templates/customize` — CSS 커스터마이징
    - `GET /api/public/preview/{tenant_slug}?tpl={template_id}` — 미리보기
  - [ ] 템플릿 변경 이력 7일 보관 후 자동 삭제 (Celery)
- **완료 조건:** 템플릿 변경 후 홈페이지 디자인 즉시 반영, 콘텐츠 유지 확인

---

### T-056: 기본 템플릿 6종 CSS 변수 정의 + 시드 데이터
- **담당:** 프론트엔드 + 백엔드
- **참조:** `기획서 섹션 11.2 (템플릿 목록)`
- **작업 내용:**
  - [ ] 6종 템플릿 CSS 변수 세트 정의 (`apps/client/lib/templates/`)
    - `modern-minimal.ts` — 다크 계열, 풀스크린 히어로
    - `warm-trust.ts` — 웜톤, 분할 레이아웃
    - `nature-fresh.ts` — 그린, 매거진형
    - `professional.ts` — 네이비·골드, 사이드바
    - `vibrant-youth.ts` — 원색, 비대칭 그리드
    - `clean-shop.ts` — 화이트, 상품 중심
  - [ ] `scripts/seed.py`에 6종 템플릿 시드 데이터 추가
  - [ ] 각 템플릿 썸네일 이미지 생성 (디자이너 협업 또는 스크린샷 자동화)
- **완료 조건:** 템플릿 선택기에서 6종 썸네일 노출, 각 템플릿 미리보기 가능

---

### T-057: 템플릿 미리보기 시스템
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 11.5 (미리보기 동작)`
- **작업 내용:**
  - [ ] `app/[tenant_slug]/preview/page.tsx` — 미리보기 전용 페이지
    - `?tpl={template_id}` 쿼리 파라미터로 CSS 변수 오버라이드
    - 편집 UI 없이 순수 미리보기만 렌더링
    - 상단에 "미리보기 모드" 배너 표시
  - [ ] 미리보기 URL을 관리자 페이지에서 새 탭으로 열기
- **완료 조건:** 템플릿 선택기에서 "전체 미리보기" 클릭 시 실제 콘텐츠로 렌더링

---

### T-058: 템플릿 선택기 UI 구현 (AD-06)
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 11.6 (AD-06 화면 설계)`
- **작업 내용:**
  - [ ] `apps/admin/src/pages/TemplatesPage.tsx`
  - [ ] 템플릿 카드 그리드 (썸네일, 이름, 추천 업종 태그)
  - [ ] 업종 필터 탭
  - [ ] 현재 적용 중 뱃지
  - [ ] PREMIUM 전용 잠금 표시
  - [ ] "이 템플릿 적용하기" → 확인 다이얼로그 (콘텐츠 유지 안내)
  - [ ] CSS 커스터마이징 패널 (색상 피커, 폰트 선택)
  - [ ] 롤백 버튼 + 만료일 표시
- **완료 조건:** 템플릿 선택 → 적용 → 롤백 전체 플로우 동작

---

### T-059: 색상 피커 + 폰트 선택 UI
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 11.6 (커스터마이징 패널)`
- **작업 내용:**
  - [ ] `packages/ui/src/ColorPicker.tsx` — 16진수 입력 + 색상 팔레트 프리셋
  - [ ] `packages/ui/src/FontSelector.tsx` — 한국어 웹폰트 목록 (Noto Sans KR, Pretendard, Nanum Gothic 등)
  - [ ] 커스터마이징 변경 시 실시간 미리보기 (iframe 또는 CSS 변수 즉시 적용)
  - [ ] "기본값으로 초기화" 버튼
- **완료 조건:** 색상/폰트 변경 시 오른쪽 미리보기에 즉시 반영

---

### T-060: 템플릿 시스템 통합 테스트
- **담당:** 전체
- **작업 내용:**
  - [ ] 템플릿 A 적용 → B 적용 → 롤백 → A로 복귀 시나리오 테스트
  - [ ] 콘텐츠 보존 검증 (템플릿 변경 전후 텍스트/이미지 동일)
  - [ ] 플랜 제한 테스트 (BASIC 플랜에서 PREMIUM 템플릿 접근 차단)
- **완료 조건:** 전체 시나리오 테스트 통과

---

## Phase 9: 인라인 편집 모드

> **목표:** 고객이 홈페이지 위에서 직접 편집하는 Live Edit Mode 완성
> **예상 소요:** 3일
> **선행 조건:** T-048, T-055 완료

---

### T-061: 편집 모드 Zustand 스토어 구현
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 12.3 (editStore.ts)`
- **작업 내용:**
  - [ ] `apps/client/lib/editStore.ts` 완성
    ```typescript
    interface EditStore {
      isEditMode: boolean
      pendingChanges: Map<string, PendingChange>
      isDirty: boolean
      toggleEditMode: () => void
      updateField: (sectionId, field, value) => void
      saveAll: () => Promise<SaveResult>
      discardAll: () => void
    }
    ```
  - [ ] 편집 모드 진입 조건 체크 (어드민 로그인 여부)
  - [ ] 로컬 스토리지에 임시 저장 (새로고침 후 복구 여부는 UX 결정 후 구현)
- **완료 조건:** 스토어 단위 테스트 통과

---

### T-062: 편집 모드 진입 + 툴바 구현
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 12.2 (AD-07 화면 설계)`
- **작업 내용:**
  - [ ] `apps/client/components/edit/FloatingEditButton.tsx` — 어드민 로그인 시 노출되는 플로팅 버튼
  - [ ] `apps/client/components/edit/EditToolbar.tsx` — 편집 모드 상단 고정 바
    - [템플릿 변경] [미리보기] [저장하기 💾 N개 변경사항] [편집 종료]
    - 저장 버튼: 변경사항 수 뱃지 표시
  - [ ] 편집 모드 ON/OFF 시 body에 `edit-mode` 클래스 토글
  - [ ] 페이지 이탈 방지 (`beforeunload` 이벤트)
- **완료 조건:** 편집 모드 진입 시 툴바 노출, 이탈 시 경고창 표시

---

### T-063: EditableText 컴포넌트 구현
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 12.2, 12.4`
- **작업 내용:**
  - [ ] `apps/client/components/edit/EditableText.tsx`
    - `data-editable="text"` 감지 후 `contenteditable` 활성화
    - 미니 툴바: [굵게] [기울임] [색상] [글자크기]
    - 실시간 글자 수 카운터 (maxLength prop)
    - 초과 시 입력 차단 + 빨간 테두리
    - 클릭 외부 시 편집 종료 + pendingChanges 업데이트
    - hover 시 파란 테두리 + ✏️ 아이콘
  - [ ] 섹션 컴포넌트의 모든 텍스트 필드에 EditableText 적용
- **완료 조건:** 텍스트 클릭 → 인라인 편집 → 외부 클릭 시 변경사항 임시 저장

---

### T-064: EditableImage 컴포넌트 구현
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 12.4`
- **작업 내용:**
  - [ ] `apps/client/components/edit/EditableImage.tsx`
    - `data-editable="image"` 클릭 시 파일 업로드 모달 오픈
    - 드래그앤드롭 + 파일 선택
    - 업로드 완료 시 즉시 미리보기 교체 (optimistic update)
    - 최적화 결과 토스트 표시
  - [ ] 갤러리 섹션: 다중 이미지 업로드 모달
- **완료 조건:** 이미지 클릭 → 업로드 모달 → 업로드 완료 시 즉시 화면 교체

---

### T-065: 섹션 컨트롤 바 구현
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 12.2 (섹션 컨트롤 바)`
- **작업 내용:**
  - [ ] `apps/client/components/edit/SectionControls.tsx`
    - 섹션 hover 시 상단에 컨트롤 바 노출
    - [≡ 섹션명] [↑ 위로] [↓ 아래로] [👁 숨기기] [⚙ 상세 설정]
    - 순서 변경 시 PATCH `/api/v1/sections/order` 호출 (낙관적 업데이트)
    - 숨기기 시 PATCH `/api/v1/sections/{id}/toggle` 호출
  - [ ] 첫 번째 섹션 [↑ 위로] 비활성화, 마지막 섹션 [↓ 아래로] 비활성화
- **완료 조건:** 섹션 이동/숨기기 동작, 새로고침 후 유지

---

### T-066: 일괄 저장 + 성공/실패 처리
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 12.3 (저장 플로우)`
- **작업 내용:**
  - [ ] EditToolbar의 [저장하기] 클릭 → `POST /api/v1/edit/batch-save` 호출
  - [ ] 저장 중 로딩 스피너
  - [ ] 성공 시: "저장되었습니다 ✅" 토스트 + isDirty 초기화
  - [ ] 실패 시: "저장 실패, 다시 시도해주세요" 토스트 + pendingChanges 유지
  - [ ] 부분 실패 처리 (saved_count / failed_count 표시)
- **완료 조건:** 다수 변경사항 일괄 저장 후 홈페이지 즉시 반영

---

### T-067: 인라인 편집 모드 통합 테스트
- **담당:** 전체
- **작업 내용:**
  - [ ] Playwright E2E: 편집 모드 진입 → 텍스트 변경 → 이미지 업로드 → 저장 플로우
  - [ ] 이탈 방지 경고 테스트
  - [ ] 저장 실패 시 롤백 테스트
- **완료 조건:** E2E 테스트 전체 통과

---

## Phase 10: AI 편집 어시스턴트

> **목표:** AI 문구 추천 + 대화형 편집 어시스턴트 구현
> **예상 소요:** 3일
> **선행 조건:** Phase 9 완료, OpenAI API 키 준비

---

### T-068: AI 문구 추천 API 구현
- **담당:** 백엔드
- **참조:** `기획서 섹션 13.3 (POST /ai/suggest-copy)`
- **작업 내용:**
  - [ ] `app/services/ai.py`
    - `suggest_copy(request)` — LangChain + GPT-4o-mini 프롬프트 체인
    - 업종별 프롬프트 템플릿 분리 (HOSPITAL / PENSION / STARTUP 등)
    - JSON 파싱 + 오류 처리 (재시도 1회)
  - [ ] `app/api/v1/endpoints/ai.py`
    - `POST /api/v1/ai/suggest-copy`
    - 플랜별 월 사용량 체크 (BASIC: 20회, STANDARD: 100회)
    - `ai_usage_log` 기록
  - [ ] 프롬프트 버전 관리 (상수 파일로 분리)
- **완료 조건:** 병원 업종 메인 타이틀 추천 3가지 정상 반환

---

### T-069: AI 대화형 편집 API 구현 (SSE 스트리밍)
- **담당:** 백엔드
- **참조:** `기획서 섹션 13.3 (POST /ai/chat-edit)`
- **작업 내용:**
  - [ ] `app/api/v1/endpoints/ai.py`
    - `POST /api/v1/ai/chat-edit` — SSE 스트리밍 응답
    - 현재 테넌트 사이트 컨텍스트 주입 (섹션 데이터, 현재 템플릿)
    - 응답에 액션 JSON 블록 포함 (update_text, update_theme, change_template)
    - 대화 이력 유지 (요청에 conversation_history 포함)
  - [ ] 액션 파싱 함수: AI 응답에서 JSON 블록 추출
- **완료 조건:** "메인 배너를 전문적으로 바꿔줘" → 스트리밍으로 추천 문구 + 적용 액션 반환

---

### T-070: AI 문구 추천 UI 구현
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 13.2 (기능 1: 문구 자동 생성)`
- **작업 내용:**
  - [ ] `apps/client/components/ai/CopySuggestPopover.tsx`
    - EditableText 옆 [🤖 AI 추천] 버튼 (편집 모드에서만 노출)
    - 클릭 시 팝오버: 로딩 → 3가지 추천 문구 표시
    - [적용] 클릭 시 해당 텍스트 교체 + pendingChanges 업데이트
    - [다시 생성] 버튼
  - [ ] `apps/client/hooks/useCopySuggest.ts` — API 호출 훅
- **완료 조건:** 텍스트 필드 옆 AI 추천 버튼 클릭 → 추천 문구 표시 → 적용

---

### T-071: AI 대화형 편집 패널 UI
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 13.2 (기능 2: 대화형 편집)`
- **작업 내용:**
  - [ ] `apps/client/components/ai/AiEditPanel.tsx`
    - 우측 슬라이드 패널 (편집 툴바의 [AI 어시스턴트] 버튼으로 열기)
    - 대화 메시지 목록 (사용자/AI 구분)
    - SSE 스트리밍 응답 실시간 표시 (타이핑 효과)
    - AI 응답의 액션 버튼 ([이대로 적용] [원래대로])
    - 입력창 + 전송 버튼
  - [ ] `apps/client/hooks/useAiChat.ts` — SSE 스트리밍 연결 훅
  - [ ] 액션 처리: `update_text` → editStore 업데이트, `update_theme` → CSS 변수 변경
- **완료 조건:** AI 채팅으로 텍스트 변경 지시 → 홈페이지 즉시 반영

---

### T-072: AI 사용량 관리 UI
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 13.4 (AI 사용량 관리)`
- **작업 내용:**
  - [ ] 관리자 페이지 설정 탭에 AI 사용량 현황 추가
    - 이번 달 문구 추천: N회 / 20회 (BASIC 기준)
    - 이번 달 대화형 편집: N회 / 50회
  - [ ] 한도 초과 시 업그레이드 안내 모달
  - [ ] `GET /api/v1/ai/usage` API 추가
- **완료 조건:** AI 사용량 현황 정상 표시, 한도 초과 시 업그레이드 안내

---

### T-073: AI 기능 통합 테스트 + 비용 최적화
- **담당:** 백엔드
- **작업 내용:**
  - [ ] GPT-4o-mini 프롬프트 최적화 (토큰 최소화)
  - [ ] AI 응답 캐싱 (동일 입력 1시간 Redis 캐시)
  - [ ] 비용 모니터링 (월 OpenAI 비용 추적 로그)
  - [ ] 비정상 사용 감지 (단시간 대량 호출 차단)
- **완료 조건:** 100회 추천 시 OpenAI 비용 1달러 이하 목표

---

## Phase 11: SEO & 분석

> **예상 소요:** 1일
> **선행 조건:** T-048, T-053 완료

---

### T-074: 구조화 데이터 (JSON-LD) 자동 생성
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 11 (업종별 템플릿)`
- **작업 내용:**
  - [ ] 업종별 JSON-LD 스키마 자동 생성
    - HOSPITAL: `MedicalBusiness` 스키마
    - PENSION: `LodgingBusiness` 스키마
    - RESTAURANT: `Restaurant` 스키마
    - 기본: `LocalBusiness` 스키마
  - [ ] SEO 설정의 키워드, 주소, 연락처를 스키마에 자동 주입
- **완료 조건:** Google Rich Results Test 통과

---

### T-075: 오픈 그래프 + 소셜 미리보기
- **담당:** 프론트엔드
- **작업 내용:**
  - [ ] OG 태그 동적 생성 (og:title, og:description, og:image)
  - [ ] 트위터 카드 메타태그
  - [ ] OG 이미지 없을 시 메인 비주얼 배너 이미지 자동 사용
- **완료 조건:** 카카오톡/페이스북 URL 공유 시 미리보기 정상 표시

---

### T-076: 방문자 분석 대시보드
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 4 (AD-01 Line Chart)`
- **작업 내용:**
  - [ ] 방문자 추이 Line Chart (Recharts, 7일/30일/90일 전환)
  - [ ] 모바일 비율 도넛 차트
  - [ ] 상위 유입 경로 목록
  - [ ] BASIC 플랜: 7일 데이터만, STANDARD 이상: 30일+
- **완료 조건:** 방문자 데이터 수집 → 대시보드 차트 정상 표시

---

### T-077: 구글 서치 콘솔 + 네이버 사이트 등록 가이드
- **담당:** 프론트엔드
- **작업 내용:**
  - [ ] SEO 설정 페이지에 인증 코드 입력 필드 추가
    - `google-site-verification` 메타태그 자동 삽입
    - `naver-site-verification` 메타태그 자동 삽입
  - [ ] 단계별 등록 가이드 UI (모달 형태)
- **완료 조건:** 인증 코드 입력 후 Google/Naver 사이트 인증 통과

---

## Phase 12: 테스트 & 배포

> **목표:** 전체 시스템 통합 테스트 + 프로덕션 배포 파이프라인
> **예상 소요:** 3일
> **선행 조건:** Phase 1~11 완료

---

### T-078: 전체 통합 테스트 (E2E)
- **담당:** 전체
- **작업 내용:**
  - [ ] Playwright E2E 시나리오 작성
    1. 슈퍼 어드민 → 신규 테넌트 생성
    2. 테넌트 어드민 로그인 → 대시보드 확인
    3. 섹션 편집 → 저장 → 홈페이지 반영 확인
    4. 문의 제출 → 알림 수신 → 관리자 처리
    5. 템플릿 변경 → 콘텐츠 유지 확인
    6. 인라인 편집 → AI 추천 → 저장
  - [ ] 멀티 테넌트 격리 검증 (테넌트 A → 테넌트 B 데이터 접근 불가)
- **완료 조건:** 모든 E2E 시나리오 통과

---

### T-079: 보안 점검
- **담당:** 백엔드
- **참조:** `기획서 섹션 8.2 (보안 요구사항)`
- **작업 내용:**
  - [ ] SQL Injection 테스트 (SQLAlchemy parameterized query 확인)
  - [ ] XSS 취약점 점검 (모든 사용자 입력 sanitize 확인)
  - [ ] CORS 화이트리스트 확인
  - [ ] JWT 시크릿 키 강도 확인 (32자 이상)
  - [ ] 파일 업로드 MIME 타입 magic bytes 검증 확인
  - [ ] Rate Limiting 동작 확인
  - [ ] RLS 격리 재검증
- **완료 조건:** OWASP Top 10 체크리스트 통과

---

### T-080: Nginx 설정 + SSL
- **담당:** 인프라
- **작업 내용:**
  - [ ] `nginx/nginx.conf` 작성
    - `/api/admin/*` → FastAPI :8000 프록시
    - `/api/public/*` → FastAPI :8001 프록시
    - `admin.{domain}` → Vite 빌드 파일 서빙
    - `*.{domain}` → Next.js :3000 프록시
  - [ ] SSL 인증서 설정 (Let's Encrypt + Certbot)
  - [ ] HSTS 헤더 적용
  - [ ] Gzip 압축 설정
  - [ ] Rate Limiting (IP당 100req/min)
- **완료 조건:** HTTPS 정상 동작, SSL Labs A 등급

---

### T-081: Docker 프로덕션 이미지 빌드
- **담당:** 인프라
- **작업 내용:**
  - [ ] `apps/backend/Dockerfile` — 멀티스테이지 빌드 (Python 3.13-slim)
  - [ ] `apps/admin/Dockerfile` — Node.js 빌드 → Nginx 서빙
  - [ ] `apps/client/Dockerfile` — Next.js standalone 빌드
  - [ ] `docker-compose.prod.yml` 완성 (환경변수 시크릿 관리)
  - [ ] 이미지 크기 최적화 (백엔드 500MB 이하 목표)
- **완료 조건:** `docker compose -f docker-compose.prod.yml up` 성공

---

### T-082: CI/CD 파이프라인 (GitHub Actions)
- **담당:** 인프라
- **작업 내용:**
  - [ ] `.github/workflows/test.yml`
    - PR 생성 시 자동 실행: pytest + Vitest
    - 테스트 실패 시 머지 차단
  - [ ] `.github/workflows/deploy.yml`
    - `main` 브랜치 push 시 자동 배포
    - Docker 이미지 빌드 → ECR 푸시 → ECS 배포
  - [ ] 환경변수 GitHub Secrets 관리
- **완료 조건:** PR 머지 → 자동 배포 → 프로덕션 반영 확인

---

### T-083: 모니터링 설정
- **담당:** 인프라
- **작업 내용:**
  - [ ] Sentry 프론트엔드 + 백엔드 에러 추적 설정
  - [ ] Grafana + Prometheus 메트릭 대시보드
    - API 응답 시간 P95
    - DB 연결 수
    - 큐 대기 태스크 수
    - 에러율
  - [ ] 알림 설정 (에러율 5% 초과 시 슬랙 알림)
- **완료 조건:** Grafana 대시보드에서 시스템 지표 실시간 확인

---

## 🔖 빠른 참조

### 태스크 의존성 요약

```
T-001~T-008 (초기 설정)
    ↓
T-009~T-010 (모델/스키마)
    ↓
T-011~T-015 (인증)
    ↓
T-016~T-025 (핵심 API) ──────────── T-026~T-029 (파일 업로드)
    ↓                                       ↓
T-030~T-034 (알림)            T-035~T-046 (관리자 프론트)
    ↓                                       ↓
T-047~T-054-B (고객 홈페이지 + 홈페이지 로그인)
    ↓
T-055~T-060 (템플릿 시스템)
    ↓
T-061~T-067 (인라인 편집)
    ↓
T-068~T-073 (AI 어시스턴트)
    ↓
T-074~T-077 (SEO & 분석)
    ↓
T-078~T-083 (테스트 & 배포)
    ↓
T-084~T-094 (슈퍼 어드민 시스템)
    ↓
T-095~T-106 (SaaS 운영 시스템 — 결제·온보딩·도메인)
```

### Claude에게 지시하는 예시 문장 모음

```bash
# Phase 0 시작
"T-001 작업을 시작해줘. CLAUDE.md의 디렉토리 구조를 참조해서
모노레포 초기 구조를 생성해줘."

# API 개발
"T-016 섹션 API를 구현해줘.
기획서 섹션 5.3 스펙과 CLAUDE.md 코딩 컨벤션을 준수하고,
서비스 레이어와 엔드포인트를 모두 작성해줘."

# 프론트엔드 개발
"T-035 대시보드 페이지를 구현해줘.
기획서 AD-01 화면 설계를 참조하고,
TanStack Query로 API를 호출하며,
Recharts로 Line Chart를 그려줘."

# 테스트 작성
"T-025 작업으로 섹션 CRUD API 테스트를 작성해줘.
특히 RLS 격리 검증 테스트를 포함해줘."

# 완료 후 체크
"T-016 작업이 완료됐어.
TASK.md에서 T-016을 [x]로 업데이트하고,
다음 T-017 작업 계획을 간단히 설명해줘."
```


---

## Phase 13: 슈퍼 어드민 시스템

> **목표:** 운영사가 전체 플랫폼을 관리하는 슈퍼 어드민 완성
> **예상 소요:** 4일
> **선행 조건:** T-023 완료, Phase 6 (관리자 프론트) 완료

---

### T-084: 슈퍼 어드민 앱 초기 설정 (apps/superadmin)
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 14.2`, `CLAUDE.md 섹션 8.1`
- **작업 내용:**
  - [ ] `apps/superadmin/` Vite 7 + React 19 프로젝트 초기화 (:3002 포트)
  - [ ] `pnpm-workspace.yaml`에 `apps/superadmin` 추가
  - [ ] TailwindCSS 4.x, TypeScript 5.9 설정
  - [ ] React Router 라우팅 구성
    ```
    /super/login          ← 슈퍼 어드민 전용 로그인
    /super/dashboard      ← SA-01 운영 대시보드
    /super/tenants        ← SA-02 테넌트 목록
    /super/tenants/:id    ← SA-03 테넌트 상세·기능 관리
    /super/features       ← SA-04 기능 배포 관리
    /super/announcements  ← SA-05 공지 관리
    /super/monitoring     ← 모니터링
    /super/revenue        ← 수익 관리
    ```
  - [ ] 슈퍼 어드민 전용 axios 인스턴스 (`lib/superApi.ts`, baseURL: `/api/super/v1/`)
  - [ ] `stores/superAuthStore.ts` — 슈퍼 어드민 인증 상태
  - [ ] `apps/superadmin/.env.example` 생성
- **완료 조건:** `pnpm dev` 시 :3002 에서 슈퍼 어드민 로그인 페이지 렌더링

---

### T-085: 테넌트 관리 API 구현
- **담당:** 백엔드
- **참조:** `기획서 섹션 14.6 (테넌트 관리 API)`
- **작업 내용:**
  - [ ] `app/api/super/endpoints/tenants.py`
    - `GET /api/super/v1/tenants` — 전체 목록 (검색·플랜·업종·상태 필터, 페이지네이션)
    - `POST /api/super/v1/tenants` — 신규 테넌트 생성 + 기본 섹션 자동 생성 + 어드민 계정 생성
    - `GET /api/super/v1/tenants/{id}` — 상세 조회 (기능 현황, 사용량 포함)
    - `PATCH /api/super/v1/tenants/{id}` — 정보 수정 + audit_log 기록
    - `PATCH /api/super/v1/tenants/{id}/plan` — 플랜 변경 + 기능 플래그 자동 재계산
    - `DELETE /api/super/v1/tenants/{id}` — 소프트 삭제
    - `POST /api/super/v1/tenants/{id}/reset-password` — 어드민 임시 비밀번호 발급
    - `GET /api/super/v1/tenants/{id}/stats` — 방문자·문의·AI사용량·스토리지 현황
  - [ ] **대리 접속 API** (`POST /api/super/v1/tenants/{id}/impersonate`)
    - 30분짜리 단기 impersonate_token 발급
    - `audit_logs`에 IMPERSONATE_START 기록 필수
    - 응답: `{impersonate_token, redirect_url}`
  - [ ] 모든 쓰기 API에 `audit.log_action()` 자동 호출
- **완료 조건:** 신규 테넌트 생성 → 로그인 가능, 대리 접속 토큰으로 admin 페이지 진입

---

### T-086: 기능 플래그 서비스 + API 구현
- **담당:** 백엔드
- **참조:** `기획서 섹션 14.3`, `CLAUDE.md 섹션 8.2, 8.3`
- **작업 내용:**
  - [ ] `app/services/feature.py`
    - `get_tenant_features(db, tenant_id)` — Redis 캐시 5분 적용
    - `is_enabled(db, tenant_id, feature_key)` — 단일 기능 확인
    - `toggle_feature(db, tenant_id, feature_id, enabled)` — 개별 토글
    - `deploy_feature(db, feature_id, deployment_config)` — 배포 실행
      - GLOBAL: 전체 tenant_features 일괄 UPDATE
      - PLAN_BASED: 플랜 조건으로 필터링 UPDATE
      - SELECTIVE: 특정 tenant_id 배열로 UPDATE
      - GRADUAL: 전체의 N%를 랜덤 선택하여 UPDATE
    - `rollback_deployment(db, deployment_id)` — 배포 롤백
  - [ ] `app/api/super/endpoints/features.py`
    - `GET /api/super/v1/features` — 전체 기능 목록 + 테넌트별 활성화 수
    - `POST /api/super/v1/features` — 새 기능 등록
    - `PATCH /api/super/v1/features/{id}` — 기능 정보 수정
    - `POST /api/super/v1/features/{id}/deploy` — 배포 실행
    - `POST /api/super/v1/features/{id}/rollback` — 롤백
    - `GET /api/super/v1/tenants/{id}/features` — 테넌트 기능 목록
    - `PATCH /api/super/v1/tenants/{id}/features/{fid}` — 개별 토글
  - [ ] **테넌트용 기능 조회 API** (`GET /api/v1/tenant/features`)
    - 로그인한 테넌트의 활성 기능 목록 + 미읽은 공지 반환
    - Redis 캐시 5분
  - [ ] `require_feature()` FastAPI 의존성 구현 (CLAUDE.md 섹션 8.2 참조)
  - [ ] 초기 기능 시드 데이터 (`scripts/seed.py`에 추가)
    ```python
    기본 기능 세트:
    SECTION_EDITOR, DRAG_SECTION_ORDER, GALLERY_SECTION,
    KAKAO_NOTIFICATION, SEO_WIZARD, TEMPLATE_SELECT,
    AI_COPY_SUGGEST (STANDARD+), AI_CHAT_EDIT (STANDARD+, BETA),
    AI_MONTHLY_REPORT (PREMIUM), NAVER_ANALYTICS (미배포)
    ```
- **완료 조건:** 기능 배포 실행 → 해당 테넌트 `/api/v1/tenant/features` 응답 변경 확인

---

### T-087: 테넌트 관리자 기능 플래그 연동
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 14.5`, `CLAUDE.md 섹션 8.2`
- **작업 내용:**
  - [ ] `apps/admin/src/stores/featureStore.ts`
    - 앱 초기화 시 `GET /api/v1/tenant/features` 호출
    - `features` Map 상태 관리
    - `isEnabled(key)` 헬퍼 함수
  - [ ] `apps/admin/src/components/layout/Sidebar.tsx` 동적 메뉴 렌더링
    - `featureStore`의 `isEnabled()` 기반으로 메뉴 항목 조건부 노출
    - BETA 기능: 🔵 BETA 뱃지 표시
    - NEW 기능: 🆕 NEW 뱃지 표시 (7일간)
  - [ ] `apps/admin/src/components/layout/AnnouncementBanner.tsx`
    - 읽지 않은 공지 상단 배너 자동 노출
    - 공지 유형별 색상 (INFO: 파랑, WARNING: 노랑, URGENT: 빨강, FEATURE_UPDATE: 초록)
    - [확인] 클릭 시 읽음 처리 (`POST /api/v1/announcements/{id}/read`)
  - [ ] 비활성화된 기능 페이지 직접 URL 접근 시 → "현재 비활성화된 기능입니다" 안내 페이지
- **완료 조건:**
  - 슈퍼 어드민에서 기능 ON → 테넌트 관리자 페이지 새로고침 시 메뉴 자동 노출
  - 공지 발송 → 테넌트 관리자 페이지 상단 배너 즉시 노출

---

### T-088: 공지 API + 발송 시스템 구현
- **담당:** 백엔드
- **참조:** `기획서 섹션 14.6 (공지 API)`, `기획서 섹션 14.3 (announcements 테이블)`
- **작업 내용:**
  - [ ] `app/api/super/endpoints/announcements.py`
    - `GET /api/super/v1/announcements` — 공지 목록
    - `POST /api/super/v1/announcements` — 공지 생성 + 즉시 or 예약 발송
    - `PATCH /api/super/v1/announcements/{id}` — 수정
    - `DELETE /api/super/v1/announcements/{id}` — 삭제
    - `POST /api/super/v1/announcements/{id}/send` — 즉시 발송 트리거
  - [ ] `app/api/v1/endpoints/announcements.py` (테넌트용)
    - `GET /api/v1/announcements` — 내 공지 목록 (미읽음 포함)
    - `POST /api/v1/announcements/{id}/read` — 읽음 처리
  - [ ] Celery 태스크: 공지 대상 테넌트에게 카카오 알림톡/이메일 일괄 발송
  - [ ] 만료일 지난 공지 자동 비노출 (Celery Beat 매일 체크)
- **완료 조건:** 공지 생성 → 대상 테넌트 관리자 페이지에 배너 노출

---

### T-089: 슈퍼 어드민 대시보드 UI (SA-01)
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 14.4 (SA-01)`
- **작업 내용:**
  - [ ] `apps/superadmin/src/pages/DashboardPage.tsx`
  - [ ] 통계 카드 (전체 테넌트 수, 이번달 MRR, 알림톡 발송 수, AI 비용)
  - [ ] 플랜별 현황 + MRR 추이 차트 (Recharts)
  - [ ] 만료 예정 테넌트 목록 (D-3 이내 빨강, D-7 이내 노랑)
  - [ ] 최근 신규 테넌트 목록 + 빠른 액션 버튼 ([설정] [플랜변경] [접속])
  - [ ] 시스템 상태 표시 (서버·DB·Redis·Celery 헬스체크)
- **완료 조건:** 대시보드 모든 위젯 실데이터 정상 표시

---

### T-090: 테넌트 관리 UI (SA-02, SA-03)
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 14.4 (SA-02, SA-03)`
- **작업 내용:**
  - [ ] `apps/superadmin/src/pages/TenantsPage.tsx` (SA-02)
    - 전체 테넌트 테이블 (검색·필터·정렬·페이지네이션)
    - 신규 테넌트 생성 모달
  - [ ] `apps/superadmin/src/pages/TenantDetailPage.tsx` (SA-03)
    - [기본정보] 탭: 테넌트 정보 수정, 플랜 변경, 비밀번호 초기화
    - **[기능 관리] 탭**: 카테고리별 기능 토글 (CLAUDE.md 섹션 14.4 SA-03 화면 참조)
      - 각 기능 On/Off 토글
      - 플랜 미충족 기능: 잠금 표시 + "플랜 업그레이드 필요"
      - 변경 즉시 저장 (낙관적 업데이트 + Redis 캐시 퍼지)
    - [사용 현황] 탭: 방문자·문의·AI사용량·스토리지 차트
    - [히스토리] 탭: audit_logs 조회 (기능 변경, 플랜 변경 이력)
  - [ ] **[이 테넌트 관리자 페이지로 접속 →] 버튼**
    - 대리 접속 API 호출 → redirect_url 새 탭 오픈
    - 클릭 전 확인 모달: "대리 접속 시 모든 행위가 감사 로그에 기록됩니다"
- **완료 조건:** 기능 토글 변경 후 해당 테넌트 관리자 페이지에서 즉시 반영 확인

---

### T-091: 기능 배포 관리 UI (SA-04)
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 14.4 (SA-04)`
- **작업 내용:**
  - [ ] `apps/superadmin/src/pages/FeaturesPage.tsx`
  - [ ] 기능 목록 카드 (활성 테넌트 수, 배포 상태, BETA/NEW 뱃지)
  - [ ] 새 기능 등록 폼
    - key, name, category, 메뉴 경로/아이콘/레이블, 필요 플랜, BETA 여부
  - [ ] 배포 관리 모달 (SA-04 화면 설계 참조)
    - 배포 방식 선택 (전체/플랜별/선택/점진적)
    - 영향받는 테넌트 수 미리보기
    - 테넌트 알림 설정 (공지 배너 + 알림톡)
    - 업데이트 노트 입력
  - [ ] 배포 이력 조회 + 롤백 버튼
- **완료 조건:** 새 기능 등록 → 플랜별 배포 → 해당 플랜 테넌트 메뉴에 자동 노출

---

### T-092: 공지 관리 UI (SA-05)
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 14.4 (SA-05)`
- **작업 내용:**
  - [ ] `apps/superadmin/src/pages/AnnouncementsPage.tsx`
  - [ ] 공지 목록 + 발송 현황 (발송 수, 읽음 수)
  - [ ] 공지 작성 폼 (SA-05 화면 설계 참조)
    - 제목, 유형, 대상, 내용 (Rich Text)
    - 발송 방법 (배너/알림톡/이메일) 체크박스
    - 만료일 설정
    - [미리보기] [즉시 발송]
  - [ ] 공지 유형별 색상 뱃지 (INFO/WARNING/URGENT 등)
- **완료 조건:** 공지 작성 → 즉시 발송 → 대상 테넌트 관리자 배너 노출 확인

---

### T-093: 모니터링 + 수익 관리 UI
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 14.6 (모니터링 API)`
- **작업 내용:**
  - [ ] `apps/superadmin/src/pages/MonitoringPage.tsx`
    - AI 비용 월별 차트 (OpenAI 사용량)
    - 서버 에러 목록 (Sentry 연동)
    - Celery 큐 대기 현황
    - 알림톡 발송 현황 (월별 비용 추적)
  - [ ] `apps/superadmin/src/pages/RevenuePage.tsx`
    - MRR 추이 차트 (3개월/6개월/12개월)
    - 플랜별 테넌트 수 도넛 차트
    - 만료 예정 테넌트 목록 + 갱신 유도 알림 발송 버튼
    - 신규 가입 / 해지 / 업그레이드 / 다운그레이드 현황
- **완료 조건:** 수익 현황 및 AI 비용 차트 정상 표시

---

### T-094: 슈퍼 어드민 보안 강화
- **담당:** 백엔드
- **참조:** `기획서 섹션 14.8 (보안 규칙)`
- **작업 내용:**
  - [ ] 슈퍼 어드민 로그인 시 TOTP 2FA 검증 추가
    - `pyotp` 라이브러리 사용
    - QR 코드 초기 설정 엔드포인트
    - `POST /api/super/v1/auth/verify-2fa`
  - [ ] IP 화이트리스트 미들웨어 (환경변수 `SUPER_ADMIN_ALLOWED_IPS`)
  - [ ] 슈퍼 어드민 Access Token 만료시간 5분으로 단축
  - [ ] 감사 로그 조회 API (`GET /api/super/v1/audit-logs`)
  - [ ] 대리 접속 토큰 만료 후 자동 무효화 (Redis TTL 30분)
- **완료 조건:** 2FA 없이 슈퍼 어드민 로그인 불가, 대리 접속 시 audit_log 기록 확인



---

## Phase 14: SaaS 운영 시스템

> **목표:** 결제(토스페이먼츠 정기결제)·온보딩·도메인 자동화·구독 관리 완성
> **예상 소요:** 5일
> **선행 조건:** T-023 (슈퍼 어드민 API), T-012 (인증 API) 완료
> **참조:** `기획서 섹션 15 전체`

---

### T-095: 결제 DB 스키마 + 마이그레이션
- **담당:** 백엔드
- **참조:** `기획서 섹션 15.2 (DB 스키마)`
- **작업 내용:**
  - [ ] `app/models/billing.py` — Subscription, PaymentHistory, PlanChangeHistory 모델
  - [ ] `app/models/domain.py` — TenantDomain 모델
  - [ ] Alembic 마이그레이션 생성 및 적용
  - [ ] `scripts/seed.py`에 테스트용 구독 데이터 추가
  - [ ] `app/schemas/billing.py` — Pydantic 스키마 전체
- **완료 조건:** `alembic upgrade head` 성공, 모델 import 에러 없음

---

### T-096: 토스페이먼츠 결제 서비스 구현
- **담당:** 백엔드
- **참조:** `기획서 섹션 15.2 (토스페이먼츠 연동 핵심 코드)`
- **작업 내용:**
  - [ ] `app/services/payment.py`
    - `issue_billing_key(customer_key, auth_key)` — 빌링키 발급
    - `charge_billing(billing_key, customer_key, amount, order_id, order_name)` — 자동 결제
    - `cancel_payment(payment_key, reason)` — 결제 취소·환불
    - `get_payment_status(payment_key)` — 결제 상태 조회
  - [ ] 토스페이먼츠 테스트 환경 설정 (test_ 키 사용)
  - [ ] `app/api/v1/endpoints/billing.py`
    - `POST /api/v1/billing/register-card` — 빌링키 발급 (카드 등록)
    - `GET  /api/v1/billing/subscription` — 현재 구독 정보
    - `GET  /api/v1/billing/history` — 결제 이력
    - `POST /api/v1/billing/cancel` — 구독 해지 신청
    - `POST /api/v1/billing/change-plan` — 플랜 변경
  - [ ] `POST /api/webhook/tosspayments` — 웹훅 수신 (HMAC 서명 검증 필수)
  - [ ] 환경변수 추가: `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`, `TOSS_WEBHOOK_SECRET`
- **완료 조건:** 테스트 카드로 빌링키 발급 → 수동 결제 → 결제 이력 조회 성공

---

### T-097: 정기결제 Celery 태스크 구현
- **담당:** 백엔드
- **참조:** `기획서 섹션 15.2 (Celery 정기결제 태스크)`
- **작업 내용:**
  - [ ] `app/workers/billing.py`
    - `process_monthly_billing` — 매일 00:05 오늘 결제일 구독 자동 결제
    - `retry_billing` — 결제 실패 재시도 (24시간 간격, 최대 3회)
    - `check_expiring_subscriptions` — 매일 09:00 D-7, D-3 만료 예정 알림
    - `suspend_expired_subscriptions` — 매일 00:10 만료 구독 접근 차단
    - `delete_cancelled_tenant_data` — 매일 03:00 해지 후 30일 데이터 삭제
  - [ ] Celery Beat 스케줄 등록 (5개 태스크)
  - [ ] 결제 실패 3회 시 슈퍼 어드민에게 알림 발송
- **완료 조건:** Celery Beat 실행 후 스케줄 태스크 정상 등록, 테스트 결제 실행 확인

---

### T-098: 이메일 발송 서비스 구현
- **담당:** 백엔드
- **참조:** `기획서 섹션 15.4 (온보딩 이메일 자동화)`
- **작업 내용:**
  - [ ] `app/services/email.py` — AWS SES 기반 이메일 발송
    - `send_email(to, subject, template, variables)` — 기본 발송 함수
    - `send_welcome_email(tenant, temp_password)` — 환영 메일
    - `send_payment_receipt(tenant, payment)` — 영수증
    - `send_payment_failed(tenant, attempt_count)` — 결제 실패 알림
    - `send_expiring_notice(tenant, days_left)` — 만료 예정 알림
    - `send_cancellation_confirmed(tenant)` — 해지 확인
    - `send_data_deleted(email)` — 데이터 삭제 완료
  - [ ] 이메일 HTML 템플릿 작성 (Jinja2, 7종)
  - [ ] 환경변수 추가: `AWS_SES_REGION`, `AWS_SES_FROM_EMAIL`
  - [ ] Celery 태스크로 비동기 처리 (`send_email_async`)
- **완료 조건:** 환영 메일 실제 수신 확인, 영수증 이메일 수신 확인

---

### T-099: 무료 체험(Trial) 시스템 구현
- **담당:** 백엔드
- **참조:** `기획서 섹션 15.6 (Trial 시스템)`
- **작업 내용:**
  - [ ] 테넌트 생성 시 Trial 구독 자동 생성 (14일, STANDARD 기능)
  - [ ] Trial 기간 중 카드 등록 없이 전 기능 사용 가능
  - [ ] Trial D-3 알림 Celery 태스크
  - [ ] Trial 종료 처리 (카드 등록 여부에 따라 분기)
  - [ ] `GET /api/v1/billing/trial-status` — 체험 남은 일수 반환
  - [ ] 관리자 페이지 상단에 Trial 남은 일수 배너 표시
- **완료 조건:** 신규 테넌트 생성 → 14일 Trial → 종료 시 접근 차단 시나리오 테스트

---

### T-100: 커스텀 도메인 서비스 구현
- **담당:** 백엔드/인프라
- **참조:** `기획서 섹션 15.3 (커스텀 도메인 자동화)`
- **작업 내용:**
  - [ ] `app/services/domain.py`
    - `verify_dns(domain, expected_cname)` — DNS CNAME 전파 확인 (dnspython)
    - `issue_ssl_certificate(domain)` — Let's Encrypt SSL 발급 (certbot)
    - `add_nginx_config(domain, tenant_slug)` — Nginx 가상 호스트 추가
    - `remove_nginx_config(domain)` — Nginx 설정 제거
    - `renew_ssl_certificate(domain)` — SSL 갱신
  - [ ] `app/api/v1/endpoints/domain.py`
    - `POST /api/v1/domain/register` — 커스텀 도메인 등록 신청
    - `GET  /api/v1/domain/status` — 도메인 연결 상태 확인
    - `POST /api/v1/domain/verify` — DNS 전파 수동 확인
    - `DELETE /api/v1/domain` — 도메인 연결 해제
  - [ ] `app/api/super/endpoints/domains.py`
    - `GET  /api/super/v1/domains` — 전체 도메인 목록
    - `POST /api/super/v1/domains/{id}/ssl-renew` — SSL 수동 갱신
  - [ ] DNS 확인 Celery 태스크 (도메인 등록 후 1분마다 폴링, 최대 24시간)
  - [ ] SSL 만료 D-30 자동 갱신 Celery Beat 태스크
  - [ ] 의존성 추가: `dnspython`, `subprocess` (certbot 호출)
- **완료 조건:** 실제 도메인으로 CNAME 설정 → 자동 DNS 확인 → SSL 발급 → 접속 성공

---

### T-101: 도메인 관리 UI 구현 (AD-08 탭)
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 15.5 (AD-08 도메인 탭)`
- **작업 내용:**
  - [ ] `apps/admin/src/pages/BillingPage.tsx` 탭 확장
    - [구독 현황] 탭: 현재 플랜, 다음 결제일, 업그레이드/해지 버튼
    - [결제 수단] 탭: 등록된 카드 표시, 카드 변경
    - [결제 내역] 탭: 결제 이력 테이블, 영수증 다운로드
    - **[도메인] 탭**: 현재 도메인 상태, 커스텀 도메인 변경
  - [ ] 토스페이먼츠 결제 위젯 연동 (카드 등록 UI)
    - `@tosspayments/payment-widget` 패키지 설치
    - 카드 등록 모달
  - [ ] 도메인 연결 상태 실시간 확인 (30초 폴링)
    - PENDING → DNS_CHECKING → SSL_ISSUING → ACTIVE 단계 표시
  - [ ] Trial 배너 컴포넌트 (남은 일수 + 카드 등록 CTA)
- **완료 조건:** 카드 등록 → 결제 내역 표시, 도메인 등록 → 상태 변화 실시간 표시

---

### T-102: 구독 해지 플로우 UI 구현
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 15.7 (구독 해지 처리)`
- **작업 내용:**
  - [ ] 해지 신청 다이얼로그
    - 해지 사유 선택 (5가지 옵션)
    - "현재 기간까지 서비스 유지" 안내
    - "30일 후 데이터 완전 삭제" 경고
    - [해지 취소] [해지 확인] 버튼
  - [ ] 해지 완료 후 페이지에 재구독 CTA 배너 표시
  - [ ] 구독 만료 후 접속 시 → 만료 안내 페이지 + 재구독 버튼
- **완료 조건:** 해지 신청 → 기간 종료 후 접근 차단 → 재구독 CTA 표시

---

### T-103: 슈퍼 어드민 결제 현황 UI (SA-06)
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 15.5 (SA-06)`
- **작업 내용:**
  - [ ] `apps/superadmin/src/pages/BillingOverviewPage.tsx`
  - [ ] 통계 카드 (MRR, 연체 수, 해지 수, 신규 수)
  - [ ] 연체 테넌트 즉시 처리 (수동 결제, 유예 처리)
  - [ ] 환불 처리 UI
  - [ ] MRR 추이 차트 (Recharts)
  - [ ] 플랜별 테넌트 수 도넛 차트
- **완료 조건:** 결제 현황 정상 표시, 수동 결제 실행 가능

---

### T-104: 온보딩 자동화 통합 테스트
- **담당:** 전체
- **작업 내용:**
  - [ ] 신규 테넌트 생성 → 환영 메일 수신 시나리오 E2E 테스트
  - [ ] 카드 등록 → 자동 결제 → 영수증 수신 시나리오 테스트
  - [ ] 결제 실패 → 재시도 → 3회 실패 → 서비스 중단 시나리오 테스트
  - [ ] Trial → 만료 → 카드 등록 → ACTIVE 전환 시나리오 테스트
  - [ ] 커스텀 도메인 등록 → DNS 확인 → SSL 발급 → 접속 확인 테스트
  - [ ] 구독 해지 → 기간 종료 → 데이터 삭제 시나리오 테스트
- **완료 조건:** 6개 시나리오 전체 통과

---

### T-105: SSL 자동 갱신 + 도메인 모니터링
- **담당:** 백엔드/인프라
- **작업 내용:**
  - [ ] SSL 만료 D-30 자동 갱신 Celery Beat 태스크
  - [ ] SSL 갱신 실패 시 슈퍼 어드민 긴급 알림
  - [ ] `GET /api/super/v1/domains` 에 SSL 만료일 표시
  - [ ] 슈퍼 어드민 대시보드에 SSL 만료 예정 도메인 경고 위젯
- **완료 조건:** SSL 만료 30일 전 자동 갱신 실행 확인

---

### T-106: 결제 + 온보딩 보안 강화
- **담당:** 백엔드
- **작업 내용:**
  - [ ] 토스페이먼츠 웹훅 HMAC-SHA256 서명 검증 필수 구현
  - [ ] 빌링키 암호화 저장 (AES-256, 환경변수 키)
  - [ ] 결제 관련 모든 API Rate Limiting (결제 API 분당 5회)
  - [ ] 결제 이상 탐지 (동일 테넌트 단기간 중복 결제 차단)
  - [ ] PCI DSS 준수 확인 (카드번호·CVV 서버 미저장 검증)
- **완료 조건:** 위변조 웹훅 요청 차단, 빌링키 암호화 저장 확인


---

*최종 업데이트: 2026-05-24*
*총 113개 태스크 | 예상 총 개발 기간: 약 12~14주 (1~2인 팀 기준)*
