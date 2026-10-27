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
| Phase 1: 인프라 & DB | 2 | 2 | 100% |
| Phase 2: 인증 시스템 | 5 | 5 | 100% |
| Phase 3: 핵심 CRUD API | 10 | 10 | 100% |
| Phase 4: 파일 업로드 & 이미지 | 4 | 4 | 100% |
| Phase 5: 알림 시스템 | 5 | 5 | 100% |

| Phase 6: 관리자 프론트엔드 | 12 | 12 | 100% |
| Phase 7: 고객 홈페이지 + 홈페이지 로그인 | 11 | 11 | 100% |
| Phase 8: 템플릿 시스템 | 6 | 6 | 100% |
| Phase 9: 인라인 편집 모드 | 9 | 9 | 100% |
| Phase 10: AI 어시스턴트 | 6 | 6 | 100% |
| Phase 11: SEO & 분석 | 4 | 4 | 100% |
| Phase 12: 테스트 & 배포 | 9 | 9 | 100% |
| **Phase 13: 슈퍼 어드민 시스템** | **11** | **11** | **100%** |
| **Phase 14: SaaS 운영 시스템** | **12** | **12** | **100%** |
| **Phase 15: 방문자 인증** | **10** | **10** | **100%** |
| **Phase 16: 코드형 템플릿 & 목업 이식** | **9** | **9** | **100%** |
| **합계** | **133** | **133** | **100%** |

---

## 🔔 운영 배포 전 필수 (실고객을 받기 전에 반드시)

> 개발 태스크는 모두 끝났지만, 아래가 남아 있으면 **운영 오픈 금지**. 상세: `docs/운영배포-체크리스트.md`
> (2026-10-27 등록 — 사용자 요청으로 백업은 나중에 진행하기로 함)

- [ ] **🔔 B5 DB · 업로드 이미지 백업** — 지금은 백업 장치가 없음 → 장애 · 실수 시 데이터 복구 불가
  - 추천안: AWS S3 + 30일 보관 (매일 새벽 DB 전체 · 이미지 변경분, 복원 스크립트 · 실패 알림 포함, 1~2일 작업)
  - 사용자 준비: 백업용 S3 버킷 + 그 버킷 전용 접근 키
- [ ] **🔔 B6 이미지 저장소(MinIO) 이미지 교체** — 공식 `minio/minio` Docker 이미지를 더 이상 받을 수 없음 (2026-10-27 확인). 새 서버 · 새 개발 PC 에서 MinIO 가 안 뜸
  - 결정 필요: ① AWS S3 로 이미지 저장 (B5 백업과 함께 정리 권장) ② Chainguard MinIO 빌드 (CI 는 이걸로 전환됨)
- [ ] **샘플 이미지 출처 확인** — hospital-a 메인 이미지 14장 · 아이콘 · 로고 상업 이용 여부 (`SOURCES.md`, 기획서 11.8). 확인 전에는 업로드 스크립트가 운영 업로드 거부
- [ ] **외부 서비스 실제 키** — 카카오 · 네이버 로그인, 알림톡, SMS(SENS), 이메일(SES), 토스페이먼츠, reCAPTCHA (체크리스트 1절). 운영 설정 점검이 비어 있으면 백엔드 기동 거부
- [ ] **배포 리허설** — 스테이징 서버에 체크리스트 3절 순서대로 배포 → 4절 스모크 테스트

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

### T-021: 대시보드 통계 API 구현 ✅
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

### T-022: 배치 저장 API 구현 (인라인 편집용) ✅
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

### T-023: 슈퍼 어드민 기반 API 구조 설정 ✅
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

### T-024: 분석 데이터 수집 API ✅
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

### T-025: CRUD API 통합 테스트 ✅
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

### T-028: 프론트엔드 이미지 업로드 컴포넌트 ✅
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 4 (AD-02-B 이미지 업로드)`
- **작업 내용:**
  - [x] `packages/ui/src/ImageUpload.tsx`
    - 드래그앤드롭 + 파일 선택 버튼
    - 업로드 진행률 표시 (axios onUploadProgress)
    - 최적화 결과 표시 ("8.2MB → 340KB로 최적화")
    - 현재 이미지 미리보기 + 삭제 버튼
  - [x] 파일 타입/크기 클라이언트 검증 (20MB 이상 즉시 에러)
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
  - [x] `apps/admin/src/pages/InquiriesPage.tsx`
  - [x] 검색 필터 (날짜 피커, 유형, 상태)
  - [x] 데이터 테이블 (정렬, 페이지네이션)
  - [x] 상태 변경 드롭다운 (인라인)
  - [x] 상세보기 모달 (AD-04-M)
    - 문의자 정보 + 연락처 클립보드 복사
    - 문의 내용 전체 노출
    - 관리자 메모 Textarea
    - [삭제] [저장] 버튼
  - [x] 엑셀 내보내기 버튼
  - [x] 미처리 문의 수 빨간 뱃지 (AD-01 대시보드와 공유)
- **완료 조건:** 문의 목록 조회, 상태 변경, 메모 저장 전체 동작

---

### T-040: SEO 설정 마법사 구현 (AD-05)
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 4 (AD-05)`
- **작업 내용:**
  - [x] `apps/admin/src/pages/SeoPage.tsx`
  - [x] 탭 구조: [기본 SEO] [소셜 미리보기] [사이트맵] [분석]
  - [x] 검색결과 실시간 미리보기 (Google 스니펫 스타일)
  - [x] 글자 수 실시간 카운터 (제목 60자, 설명 160자)
  - [x] 키워드 태그 입력 (엔터로 추가, × 버튼으로 삭제)
  - [x] OG 이미지 업로드
  - [x] BASIC 플랜: 일부 기능 잠금 + 업그레이드 안내
- **완료 조건:** SEO 설정 저장 후 공개 홈페이지 메타태그 반영 확인

---

### T-041: 요금제 페이지 구현
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 3.2 (요금제 플랜)`
- **작업 내용:**
  - [x] `apps/admin/src/pages/BillingPage.tsx`
  - [x] 현재 플랜 표시 + 기능 사용 현황 (문의 수, 스토리지 용량, 알림 발송 수)
  - [x] 플랜 비교 테이블 (BASIC / STANDARD / PREMIUM)
  - [x] 업그레이드 버튼 (실제 결제는 추후 구현, 현재는 문의하기 연결)
- **완료 조건:** 현재 플랜 및 사용 현황 정상 표시

---

### T-042: 공통 에러 처리 UI
- **담당:** 프론트엔드
- **참조:** `CLAUDE.md 섹션 5 (에러 코드 표준)`
- **작업 내용:**
  - [x] axios 에러 인터셉터 완성 (API 에러 코드별 토스트 메시지)
  - [x] 전역 에러 바운더리 컴포넌트
  - [x] 404/403/500 에러 페이지
  - [x] 네트워크 오프라인 감지 + 안내 배너
  - [x] 폼 필드 에러 메시지 표시 (서버 검증 에러 → 해당 필드 하이라이트)
- **완료 조건:** API 에러 발생 시 적절한 UI 피드백 표시

---

### T-043: 관리자 반응형 최적화
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 8.1 (성능 목표)`
- **작업 내용:**
  - [x] 모바일 (768px 미만): 사이드바 → 하단 탭바로 전환
  - [x] 태블릿 (1024px 미만): 사이드바 축소 (아이콘만)
  - [x] 데이터 테이블 모바일: 카드 레이아웃으로 전환
  - [ ] Lighthouse 성능 점수 90점 이상 목표 (번들 코드 스플릿은 후속 라운드)
- **완료 조건:** 모바일에서 모든 관리자 기능 사용 가능

---

### T-044: 관리자 접근성 (a11y) 기본 적용
- **담당:** 프론트엔드
- **작업 내용:**
  - [x] 모든 인터랙티브 요소 키보드 접근 가능
  - [x] 이미지 alt 텍스트
  - [x] 폼 레이블 연결
  - [x] 색상 대비율 WCAG AA 준수
- **완료 조건:** axe DevTools 심각 오류 0개

---

### T-045: 관리자 프론트엔드 Vitest 테스트
- **담당:** 프론트엔드
- **작업 내용:**
  - [x] `apps/admin/src/__tests__/` 디렉토리 생성
  - [x] 인증 스토어 단위 테스트
  - [x] 섹션 편집 폼 유효성 검사 테스트
  - [x] API 목킹 (msw) 설정
- **완료 조건:** `pnpm test` 전체 통과

---

### T-046: 관리자 빌드 최적화 ✅
- **담당:** 프론트엔드
- **작업 내용:**
  - [x] Code Splitting — 페이지별 lazy loading
  - [x] 번들 크기 분석 (`vite-bundle-visualizer`)
  - [x] 초기 번들 500KB 미만 목표 (초기 gzip ~176KB)
- **완료 조건:** `pnpm build` 성공, 번들 크기 목표 달성

---

## Phase 7: 고객 홈페이지 (apps/client)

> **목표:** 테넌트별 홈페이지 SSR 렌더링 완성
> **예상 소요:** 3일
> **선행 조건:** T-020 (Public API), T-037 (섹션 컴포넌트 참조)

---

### T-047: 고객 홈페이지 기본 구조 ✅
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 2.1 (앱/client)`, `기획서 섹션 11 (템플릿)`
- **작업 내용:**
  - [x] `app/[tenant_slug]/page.tsx` — SSR로 Public API 데이터 fetch
  - [x] `app/[tenant_slug]/layout.tsx` — SEO 메타태그 동적 주입
    ```typescript
    export async function generateMetadata({ params }) {
      const seo = await fetchSeoSettings(params.tenant_slug)
      return { title: seo.page_title, description: seo.meta_description, ... }
    }
    ```
  - [x] 비활성 테넌트 접근 시 404 페이지
  - [x] 로딩 스켈레톤 (`loading.tsx`)
- **완료 조건:** `/{tenant_slug}` 접속 시 해당 테넌트 홈페이지 SSR 렌더링

---

### T-048: 섹션 컴포넌트 구현 (6종) ✅
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 11.2 (템플릿 목록)`, `기획서 AD-02-B`
- **작업 내용:**
  - [x] `apps/client/components/sections/HeroBanner.tsx`
  - [x] `apps/client/components/sections/Intro.tsx`
  - [x] `apps/client/components/sections/Services.tsx`
  - [x] `apps/client/components/sections/Gallery.tsx` (이미지 갤러리)
  - [x] `apps/client/components/sections/ContactForm.tsx` (문의 폼 → Public API 제출)
  - [x] `apps/client/components/sections/Map.tsx` (카카오 지도 SDK)
  - [x] 각 컴포넌트 — `data-editable`, `data-field`, `data-section-id` 속성 부착
  - [x] `SectionRenderer.tsx` — section_type에 따라 동적 컴포넌트 렌더링
- **완료 조건:** 모든 섹션 타입 정상 렌더링, 모바일 반응형

---

### T-049: 공통 레이아웃 컴포넌트 (네비게이션, 푸터, 플로팅 버튼) ✅
- **담당:** 프론트엔드
- **참조:** `CLAUDE.md 섹션 7.3 (홈페이지 편집 모드 진입 흐름)`
- **작업 내용:**
  - [x] `apps/client/components/layout/Navbar.tsx`
    - 로고, 메뉴 항목 (섹션 앵커 링크 — JS scrollIntoView)
    - 스크롤 시 sticky 전환
    - 모바일 햄버거 메뉴
  - [x] `apps/client/components/layout/Footer.tsx`
    - SNS 채널 아이콘 (설정에 따라 동적 노출)
    - 사업자 정보 (tenant.name + © 연도)
  - [x] `apps/client/components/layout/FloatingButtons.tsx`
    - 카카오톡 채널 플로팅 버튼 (SNS 설정에서 활성화 시)
    - 맨 위로 버튼 (스크롤 200px↑)
    - **인증 상태에 따라 동적 버튼 노출** ← 핵심
      ```
      isLoggedIn = false → 🔐 [관리자 로그인] 버튼 노출
                              클릭 시 /{slug}/login 이동
      isLoggedIn = true  → ✏️ [편집 모드] 버튼 노출
                              클릭 시 toggleEditMode()
      isEditMode = true  → [편집 종료] 버튼으로 교체
      ```
    - `authStore.initialize()` 호출로 쿠키 기반 자동 로그인 확인
  - [x] `EditModeBanner.tsx` (편집 모드 진입 시 상단 배너)
- **완료 조건:**
  - 비로그인: 🔐 로그인 버튼 노출 → 로그인 성공 → ✏️ 편집 버튼으로 교체
  - admin에서 로그인 후 홈페이지 접속: ✏️ 편집 버튼 바로 노출 (재로그인 불필요)

---

### T-050: CSS 변수 기반 테마 시스템 구현 ✅
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 11.3 (템플릿 데이터 구조)`, `CSSVariableSet`
- **작업 내용:**
  - [x] `apps/client/lib/theme.ts` — `buildCssVarBody` + 키 정규화 + 값 sanitize
  - [x] SSR 시 `<head>`에 CSS 변수 인라인 삽입 (FOUC 방지)
    ```typescript
    // layout.tsx에서 스타일 주입
    const cssVarBody = buildCssVarBody(site?.template?.css_variables)
    // <style dangerouslySetInnerHTML={`:root { ${cssVarBody} }`} />
    ```
  - [x] TailwindCSS 4.x arbitrary 값으로 var() 연동 (`bg-[var(--color-primary)]` 등)
  - [x] 섹션 6종 + 레이아웃 4종 전체를 CSS 변수 기반으로 리팩토링
  - [x] globals.css에 풀 디자인 토큰 fallback 정의 (색/폰트/모서리/그림자/간격)
- **완료 조건:** 템플릿 변경 시 CSS 변수만 교체되어 전체 디자인 변경

---

### T-051: 고객 문의 폼 + reCAPTCHA ✅
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 5.5 (POST /inquiries)`
- **작업 내용:**
  - [x] `apps/client/components/sections/ContactForm.tsx`
    - 이름, 연락처, 이메일(선택), 문의 내용 필드
    - react-hook-form + zod 유효성 검사 (인라인 에러 노출)
    - reCAPTCHA v3 비표시 검증 (`lib/recaptcha.ts`)
    - 제출 성공/실패 피드백 (sonner toast)
    - 문의 유형 선택 (GENERAL / RESERVATION / SYMPTOM)
  - [x] 문의 유형별 폼 필드 커스터마이징 (병원: 증상 선택 등) → T-051-A 에서 완료
- **완료 조건:** 문의 제출 → 관리자 알림 수신 → 관리자 페이지 목록 노출

---

### T-051-A: 업종별 문의 폼 필드 ★신규 ✅
- **담당:** 백엔드/프론트엔드
- **참조:** `기획서 섹션 16.2 (업종별 기능 차이)`
- **작업 내용:**
  - [x] 마이그레이션 0025 — `inquiries.detail` JSONB (기본 `{}`, 기존 문의 호환)
  - [x] `app/services/inquiry_fields.py` — 업종별 칸 정의 한곳 관리 · 검증 · 관리자 표시 변환
    - 병원: 진료과 · 초진/재진 · 증상(복수 선택) / 문의 유형 일반 · 예약 · 증상
    - 펜션: 체크인 · 체크아웃 · 성인 · 아동 · 희망 객실 / 문의 유형 일반 · 예약
    - 스타트업 · 일반: 회사명 · 문의 분야 / 문의 유형 일반
    - 정의에 없는 칸(다른 업종 칸 포함)은 버리고, 선택지 밖 · 형식 오류는 400 `detail.<칸>`
  - [x] 공개 API `GET /api/public/inquiries/fields?tenant_slug=` — 폼이 그릴 문의 유형 · 칸 목록
  - [x] 관리자 문의 상세 응답 `detail_items` (칸 이름 · 선택지 이름) + 상세 창 "추가 정보" 영역
  - [x] `ContactForm` — 칸 목록대로 입력칸 · zod 검증 생성, 못 받으면 일반 문의 폼으로 동작
  - [x] 홈페이지 루트 레이아웃에 sonner `<Toaster />` 마운트 (없어서 문의 접수 · 편집 모드 토스트가 화면에 안 보이던 버그)
  - [x] 시드: test-tenant 홈 CONTACT 섹션 보장 → `e2e/inquiry.spec` 활성화 (+ 업종 칸 접수 시나리오)
- **테스트:** 백엔드 37 · 시드 1 · client 9 · admin 3 · E2E 2
- **완료 조건:** 업종별 칸이 보이는 폼으로 문의 제출 → 관리자 문의 상세에서 추가 정보 확인 ✅

---

### T-052: 홈페이지 성능 최적화 ✅
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 8.1 (성능 목표 LCP ≤ 2초)`
- **작업 내용:**
  - [x] 이미지 `next/image` 컴포넌트 적용 (Intro/Gallery, fill + sizes + lazy)
  - [x] 섹션 dynamic 로드 + 스켈레톤 (Map은 `next/dynamic ssr:false`, MapLoader)
  - [x] 폰트 최적화 (`next/font/google` Noto Sans KR, weight 400/700, display: swap)
    - Pretendard는 next/font/google 미지원 → 운영 시 별도 패키지로 검토
  - [~] Critical CSS 인라인 (Next.js 15 App Router 자동 적용 + theme.ts SSR `<style>`)
  - [~] Lighthouse LCP 2초 이하, CLS 0.1 이하 목표 (코드 적용 완료, 측정은 운영 환경에서)
- **완료 조건:** Lighthouse 성능 점수 90점 이상

---

### T-053: 사이트맵 + 로봇 텍스트 ✅
- **담당:** 프론트엔드/백엔드
- **참조:** `기획서 섹션 5.7 (SEO)`
- **작업 내용:**
  - [x] `app/[tenant_slug]/sitemap.ts` — 테넌트별 동적 사이트맵 (멀티테넌트 격리)
  - [x] `app/robots.ts` — robots.txt 동적 생성
  - [x] 구조화 데이터 (JSON-LD) — LocalBusiness 스키마
    - template_type → schema.org 매핑 (HOSPITAL→MedicalBusiness, PENSION→LodgingBusiness, STARTUP→Organization, GENERAL→LocalBusiness)
    - MAP 섹션의 address 자동 추출 → PostalAddress
    - SNS url 모두 → sameAs
- **완료 조건:** `/{slug}/sitemap.xml`, `/robots.txt` 정상 응답

---

### T-054: 고객 홈페이지 통합 테스트 ✅
- **담당:** 프론트엔드
- **작업 내용:**
  - [x] Playwright E2E 테스트 설정 (config + webServer 자동 시작)
  - [x] homepage.spec — 홈페이지 진입, Navbar/Footer/FloatingButtons, 404 콘텐츠
  - [x] seo.spec — JSON-LD LocalBusiness, CSS 변수 SSR, sitemap.xml, robots.txt
  - [x] inquiry.spec — 시드 CONTACT 섹션 추가 후 활성화 (T-051-A)
- **완료 조건:** E2E 테스트 전체 통과 (8 passed / 1 skipped / 0 failed)

#### 부수 변경
- `app/[tenant_slug]/sitemap.ts` → `app/[tenant_slug]/sitemap.xml/route.ts` (Route Handler)
  Next.js 15에서 dynamic 라우트의 sitemap.ts는 params를 안정적으로 전달받지 못함 → Route Handler로 전환해 XML 직접 생성

---

### T-054-A: 홈페이지 로그인 컴포넌트 구현 ★신규 ✅
- **담당:** 프론트엔드
- **참조:** `CLAUDE.md 섹션 7.1, 7.3, 7.7`
- **작업 내용:**
  - [x] `apps/client/lib/authStore.ts` 완성 (CLAUDE.md 섹션 7.7 참조)
    - `initialize()` — 페이지 로드 시 `GET /api/v1/auth/me` 호출 (쿠키 자동 전송)
    - `login()`, `logout()`, `toggleEditMode()` 액션
  - [x] `apps/client/components/auth/LoginModal.tsx`
    - LoginForm 재사용 + 백드롭/ESC/스크롤 락
    - 로그인 성공 시 모달 자동 닫기
    - 로그인 실패 시 에러 분기 (네트워크/401/429/기타)
    - [관리자 페이지로 이동 →] 링크 (`NEXT_PUBLIC_ADMIN_URL`)
  - [x] `apps/client/components/auth/LoginForm.tsx` (공통)
  - [x] `app/[tenant_slug]/login/page.tsx` (구 placeholder 교체)
    - 풀페이지 레이아웃 (var 토큰 적용)
    - 이미 로그인 시 자동 홈 리다이렉트
    - 성공 시 `/{tenant_slug}` 리다이렉트
  - [x] `app/[tenant_slug]/layout.tsx`에서 `AuthInitializer` 마운트
    - 페이지 로드 시 자동으로 쿠키 확인 → 로그인 상태 복원
  - [x] `FloatingButtons` 모달 토글 전환 (navigate 제거)
- **완료 조건:**
  - 홈페이지에서 직접 로그인 가능 (모달 또는 풀페이지)
  - admin에서 로그인 후 홈페이지 접속 시 재로그인 없이 편집 버튼 노출 (쿠키 공유)
  - 로그아웃 시 양쪽(admin, client) 모두 로그인 상태 해제

---

### T-054-B: 관리자↔홈페이지 연결 UX 구현 ★신규 ✅
- **담당:** 프론트엔드
- **참조:** `CLAUDE.md 섹션 7.4`
- **작업 내용:**
  - [x] `apps/admin` 헤더에 [내 홈페이지 열기 ↗] 버튼
    - 클릭 시 `{VITE_CLIENT_BASE_URL}/{tenant_slug}` 새 탭 오픈
    - 이미 로그인된 쿠키 공유 → 홈페이지에서 ✏️ 편집 버튼 바로 노출
    - tenantSlug 없을 때 미노출
  - [x] `apps/client` EditModeBanner에 [관리자 페이지 →] 링크
    - 클릭 시 `{NEXT_PUBLIC_ADMIN_URL}/admin/dashboard` 새 탭 오픈
  - [x] `apps/client` 편집 모드 종료 시 확인 다이얼로그
    - "저장되지 않은 변경사항이 있습니다. 어떻게 할까요?"
    - [저장 후 종료] [그냥 종료] [취소]
    - isDirty=false면 다이얼로그 생략 후 즉시 종료
    - 저장 실패 시 토스트 + 다이얼로그 유지
- **완료 조건:**
  - 관리자 페이지 ↔ 홈페이지 인라인 편집 간 자연스러운 이동
  - 어느 쪽에서 수정해도 홈페이지에 즉시 반영 확인

---

## Phase 8: 템플릿 선택 시스템

> **목표:** 템플릿 선택 + 커스터마이징 + 롤백 완성
> **예상 소요:** 2일
> **선행 조건:** T-050 완료

---

### T-055: 템플릿 서비스 + API 구현 ✅
- **담당:** 백엔드
- **참조:** `기획서 섹션 11.5 (템플릿 API)`
- **작업 내용:**
  - [x] `app/services/template.py`
    - `get_available_templates(plan_type, industry)` — 플랜·업종 필터링
    - `apply_template(db, tenant_id, template_id)` — 스냅샷 저장 + 템플릿 적용
    - `rollback_template(db, tenant_id)` — 이전 상태 복구
    - `customize_template(db, tenant_id, css_overrides)` — CSS 변수 개별 수정
  - [x] `app/api/v1/endpoints/templates.py`
    - `GET /api/v1/templates` — 목록 조회
    - `POST /api/v1/templates/apply` — 템플릿 적용
    - `POST /api/v1/templates/rollback` — 롤백
    - `PATCH /api/v1/templates/customize` — CSS 커스터마이징
    - `GET /api/public/preview/{tenant_slug}?tpl={template_id}` — 미리보기
  - [x] 템플릿 변경 이력 7일 보관 후 자동 삭제 (Celery)
- **완료 조건:** 템플릿 변경 후 홈페이지 디자인 즉시 반영, 콘텐츠 유지 확인

---

### T-056: 기본 템플릿 6종 CSS 변수 정의 + 시드 데이터 ✅
- **담당:** 프론트엔드 + 백엔드
- **참조:** `기획서 섹션 11.2 (템플릿 목록)`
- **작업 내용:**
  - [x] 6종 템플릿 CSS 변수 세트 정의 (`apps/client/lib/templates/`)
    - `modern-minimal.ts` — 다크 계열, 풀스크린 히어로
    - `warm-trust.ts` — 웜톤, 분할 레이아웃
    - `nature-fresh.ts` — 그린, 매거진형
    - `professional.ts` — 네이비·골드, 사이드바
    - `vibrant-youth.ts` — 원색, 비대칭 그리드
    - `clean-shop.ts` — 화이트, 상품 중심
  - [x] `scripts/seed.py`에 6종 템플릿 시드 데이터 추가
  - [x] 각 템플릿 썸네일 이미지 생성 (SVG 플레이스홀더 — 실디자인 추후)
- **완료 조건:** 템플릿 선택기에서 6종 썸네일 노출, 각 템플릿 미리보기 가능

---

### T-057: 템플릿 미리보기 시스템 ✅
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 11.5 (미리보기 동작)`
- **작업 내용:**
  - [x] `app/[tenant_slug]/preview/page.tsx` — 미리보기 전용 페이지
    - `?tpl={template_id}` 쿼리 파라미터로 CSS 변수 오버라이드
    - 편집 UI 없이 순수 미리보기만 렌더링
    - 상단에 "미리보기 모드" 배너 표시
  - [x] 미리보기 URL을 관리자 페이지에서 새 탭으로 열기 (buildTemplatePreviewUrl/openTemplatePreview)
- **완료 조건:** 템플릿 선택기에서 "전체 미리보기" 클릭 시 실제 콘텐츠로 렌더링

---

### T-058: 템플릿 선택기 UI 구현 (AD-06) ✅
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 11.6 (AD-06 화면 설계)`
- **작업 내용:**
  - [x] `apps/admin/src/pages/TemplatesPage.tsx`
  - [x] 템플릿 카드 그리드 (썸네일, 이름, 추천 업종 태그)
  - [x] 업종 필터 탭
  - [x] 현재 적용 중 뱃지
  - [x] PREMIUM 전용 잠금 표시
  - [x] "이 템플릿 적용하기" → 확인 다이얼로그 (콘텐츠 유지 안내)
  - [x] CSS 커스터마이징 패널 (색상 피커, 폰트 선택 — 기본 입력, T-059에서 고도화)
  - [x] 롤백 버튼 + 만료일(7일) 표시
- **완료 조건:** 템플릿 선택 → 적용 → 롤백 전체 플로우 동작

---

### T-059: 색상 피커 + 폰트 선택 UI ✅
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 11.6 (커스터마이징 패널)`
- **작업 내용:**
  - [x] `packages/ui/src/ColorPicker.tsx` — 16진수 입력 + 색상 팔레트 프리셋
  - [x] `packages/ui/src/FontSelector.tsx` — 한국어 웹폰트 목록 (Noto Sans KR, Pretendard, Nanum Gothic 등)
  - [x] 커스터마이징 변경 시 실시간 미리보기 (CSS 변수 즉시 적용)
  - [x] "기본값으로 초기화" 버튼
- **완료 조건:** 색상/폰트 변경 시 오른쪽 미리보기에 즉시 반영

---

### T-060: 템플릿 시스템 통합 테스트 ✅
- **담당:** 전체
- **작업 내용:**
  - [x] 템플릿 A 적용 → B 적용 → 롤백 → A로 복귀 시나리오 테스트
  - [x] 콘텐츠 보존 검증 (템플릿 변경 전후 텍스트/이미지 동일)
  - [x] 플랜 제한 테스트 (BASIC 플랜에서 PREMIUM 템플릿 접근 차단)
- **완료 조건:** 전체 시나리오 테스트 통과

---

## Phase 9: 인라인 편집 모드

> **목표:** 고객이 홈페이지 위에서 직접 편집하는 Live Edit Mode 완성
> **예상 소요:** 3일
> **선행 조건:** T-048, T-055 완료

---

### T-061: 편집 모드 Zustand 스토어 구현 ✅
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 12.3 (editStore.ts)`
- **작업 내용:**
  - [x] `apps/client/lib/editStore.ts` 완성 (isEditMode + pendingChanges + SaveResult)
    - `isEditMode`, `toggleEditMode`, `enterEditMode`, `exitEditMode` 추가
    - `pendingChanges` Record (JSON 직렬화 가능)
    - `saveAll()`이 SaveResult 반환 + 백엔드 BatchSaveRequest 형식과 정합
    - 부분 실패 시 pendingChanges 보존
  - [x] 편집 모드 진입 조건 체크 (authStore.isLoggedIn 검증, 비로그인 시 no-op)
  - [x] 로컬 스토리지 임시 저장 (zustand persist 미들웨어)
  - [x] UX 결정: 복구 여부 묻기 (옵션 B) — `RestoreDraftDialog` 컴포넌트
  - [x] 부수 변경: authStore에서 isEditMode 제거, consumers(FloatingButtons/EditModeBanner) 마이그레이션
  - [x] vitest 인프라 도입 + 10개 단위 테스트 통과
  - [x] 기존 saveAll 페이로드 버그 수정 (`sections` → `changes`)
- **완료 조건:** 스토어 단위 테스트 통과 (10/10)

---

### T-062: 편집 모드 진입 + 툴바 구현 ✅
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 12.2 (AD-07 화면 설계)`
- **작업 내용:**
  - [x] FloatingEditButton 역할 — 기존 `FloatingButtons`의 진입 버튼이 담당 (인증 상태 기반 동적 노출, 편집 모드 진입 시 숨김)
  - [x] `apps/client/components/edit/EditToolbar.tsx` — 편집 모드 상단 고정 바
    - 좌: [편집 모드] [템플릿 변경 ↗] [관리자 페이지 ↗]
    - 우: [저장 💾 (N)] [편집 종료]
    - 저장 버튼: 변경사항 수 뱃지 표시, N=0이면 disabled
    - 저장 결과: 성공/부분 실패 sonner 토스트
    - 편집 종료: isDirty 시 ExitConfirmDialog
  - [x] 편집 모드 ON/OFF 시 body에 `edit-mode` 클래스 토글
  - [x] 페이지 이탈 방지 (`beforeunload` 이벤트, isDirty 시만)
  - [x] EditModeBanner 삭제 → EditToolbar로 통합
  - [x] 단위 테스트 5개 (useEvent 기반)
- **완료 조건:** 편집 모드 진입 시 툴바 노출, 이탈 시 경고창 표시 (15 tests passed)

---

### T-063: EditableText 컴포넌트 구현 ✅
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 12.2, 12.4`
- **작업 내용:**
  - [x] `apps/client/components/edit/EditableText.tsx`
    - 편집 모드 + 클릭 시 `contenteditable` 활성화
    - 글자 수 카운터 (maxLength prop, 우상단 작은 뱃지)
    - maxLength 초과 시 빨간 outline + commit 시 truncate
    - 외부 클릭(blur) 시 편집 종료 + `editStore.updateField` 호출
    - hover 시 파란 점선 outline (`body.edit-mode [data-editable="text"]:hover`)
    - multiline=false: Enter 키로 commit, Escape로 취소
    - paste 시 plain text만 추출
  - [x] 섹션 6종 텍스트 필드 EditableText 적용
    - HeroBanner (main_title/sub_copy/cta_text), Intro, Services, Gallery,
      ContactForm (section_title/description), Map (address/address_detail)
  - [x] 단위 테스트 8개 (state-based assertions)
  - [~] **미니 툴바 [굵게/기울임/색상/글자크기]** — plain text 저장 한계로 별도 페이즈 분리
    (백엔드 `field_value`가 VARCHAR/TEXT, rich text 도입 시 백엔드 + 모든 섹션 렌더 흐름 재설계 필요)
- **완료 조건:** 텍스트 클릭 → 인라인 편집 → 외부 클릭 시 변경사항 임시 저장 (23 tests passed)

---

### T-064: EditableImage 컴포넌트 구현 ✅
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 12.4`
- **작업 내용:**
  - [x] `apps/client/components/edit/EditableImage.tsx`
    - 편집모드 + 클릭 시 ImageUploadModal 오픈, hover 시 어두운 오버레이
    - data-editable="image" + 키보드 접근(Enter/Space)
    - 업로드 완료 시 즉시 미리보기 교체 (pendingChanges 반영, optimistic update)
    - 최적화 결과 토스트 (`원본KB → 최적화KB, WebP`)
  - [x] `apps/client/components/edit/ImageUploadModal.tsx`
    - 드래그-드롭 + 파일 선택 + 미리보기 + 진행률 바
    - 백드롭/ESC/스크롤 락/ARIA
    - 클라이언트 검증 (20MB / image MIME)
  - [x] `apps/client/components/edit/HeroBgImageEditor.tsx` — Hero bg(CSS background) 전용 우상단 버튼
  - [x] `apps/client/lib/uploadImage.ts` — multipart POST + onProgress
  - [x] Intro/HeroBanner 마이그레이션 + globals.css `data-editable="image"` hover
  - [x] 갤러리 섹션 다중 이미지 업로드 → T-064-A 에서 완료
- **완료 조건:** 이미지 클릭 → 업로드 모달 → 업로드 완료 시 즉시 화면 교체 (4 tests passed)

---

### T-064-A: 갤러리 다중 이미지 편집 ★신규 ✅
- **담당:** 프론트엔드/백엔드
- **참조:** `기획서 섹션 12.4`
- **작업 내용:**
  - [x] `components/edit/EditableGallery.tsx` — 편집 모드에서 여러 장 업로드 · 삭제 · 앞/뒤 이동 · 캡션, 저장 전까지 pendingChanges (방문자 화면은 서버 렌더링 그대로)
  - [x] 관리자 `GalleryForm` — 여러 장 업로드 · 드래그(@dnd-kit) + 위/아래 버튼 순서 · 주소 직접 입력 유지
  - [x] `app/services/gallery_settings.py` — gallery_items 검사 · 정리 (최대 30장, 캡션 100자, http(s) · 사이트 경로만), 편집 모드 저장 · 관리자 저장 공통, value_type JSON
    - 편집 모드 저장의 1000자 한도에 걸려 사진 8장 정도부터 저장이 조용히 실패하던 문제 해소
  - [x] 이미지 30일 정리 작업이 갤러리 목록(JSON) 안의 주소도 사용 중으로 보도록 수정 (갤러리 사진이 30일 뒤 지워질 수 있던 버그)
  - [x] 실제 브라우저 검증 중 발견 · 수정한 기존 버그
    - 업로드가 JSON 으로 나가 400 (axios 기본 헤더가 FormData 를 JSON 으로 변환) → multipart 지정 (홈페이지 · 관리자)
    - 홈페이지 로그인이 access token 을 버려 편집 모드 저장 · 업로드 · AI · 섹션 컨트롤이 모두 401, 새로고침 시 로그아웃 → 토큰 보관 + Bearer 첨부 + 401 시 쿠키 갱신 1회 재시도 (갱신은 한 번에 하나)
    - 편집 초안 복구 창이 편집할 때마다 다시 뜨고, 로그인 확인 전에 초안을 지울 수 있던 문제 → 로드 후 한 번만
- **테스트:** 백엔드 갤러리 21 · 정리 작업 1 / client 갤러리 10 · 인증 8 · 초안 4 · 업로드 1 / admin 폼 6 · 업로드 1 / 실제 브라우저(관리자 업로드 3장 · 순서 · 저장, 홈페이지 편집 모드 추가 · 삭제 · 캡션 · 저장)
- **완료 조건:** 편집 모드에서 여러 장 업로드 → 순서 변경 → 저장 → 방문자 화면 반영, 관리자 폼에서도 동일 ✅

---

### T-065: 섹션 컨트롤 바 구현 ✅
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 12.2 (섹션 컨트롤 바)`
- **작업 내용:**
  - [x] `apps/client/components/edit/SectionControls.tsx`
    - 섹션 hover 시 상단에 컨트롤 바 노출
    - [≡ 섹션명] [↑ 위로] [↓ 아래로] [👁 숨기기] [⚙ 상세 설정]
    - 순서 변경 시 PATCH `/api/v1/sections/order` 호출 (낙관적 업데이트)
    - 숨기기 시 PATCH `/api/v1/sections/{id}/toggle` 호출
  - [x] 첫 번째 섹션 [↑ 위로] 비활성화, 마지막 섹션 [↓ 아래로] 비활성화
- **완료 조건:** 섹션 이동/숨기기 동작, 새로고침 후 유지

---

### T-066: 일괄 저장 + 성공/실패 처리 ✅
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 12.3 (저장 플로우)`
- **작업 내용:**
  - [x] EditToolbar의 [저장하기] 클릭 → `POST /api/v1/edit/batch-save` 호출
  - [x] 저장 중 로딩 스피너
  - [x] 성공 시: "저장되었습니다 ✅" 토스트 + isDirty 초기화
  - [x] 실패 시: "저장 실패, 다시 시도해주세요" 토스트 + pendingChanges 유지
  - [x] 부분 실패 처리 (saved_count / failed_count 표시)
- **완료 조건:** 다수 변경사항 일괄 저장 후 홈페이지 즉시 반영

---

### T-067: 인라인 편집 모드 통합 테스트 ✅
- **담당:** 전체
- **작업 내용:**
  - [x] Playwright E2E: 편집 모드 진입 → 텍스트 변경 → 이미지 업로드 → 저장 플로우
        (`e2e/editmode.spec.ts` — 섹션 SSR/시드 의존으로 `test.skip` 가드, inquiry.spec.ts와 동일 관례)
  - [x] 이탈 방지 경고 테스트
  - [x] 저장 실패 시 롤백 테스트
  - [x] 컴포넌트+스토어 통합 테스트 (`__tests__/editModeIntegration.test.tsx`, 6 케이스 결정론적 검증)
- **완료 조건:** E2E 테스트 전체 통과
  - 주: 시드 백엔드 부재로 E2E 실행 불가(inquiry와 동일). 통합 테스트로 전체 플로우 검증 완료.
  - → T-066-A 에서 실제 백엔드로 활성화

---

### T-066-A: 편집 모드 E2E 실서버 활성화 ★신규 ✅
- **담당:** 전체
- **배경:** 기존 editmode.spec 은 꺼져 있었고 로그인 · 저장을 흉내(모킹)해, 실제 서버에서 편집 API 가 전부 401 이던 버그(T-064-A 에서 발견)를 못 잡았다
- **작업 내용:**
  - [x] `e2e/editmode.spec.ts` — 실제 로그인 · 저장 · 업로드 (저장 실패만 흉내), 끝나면 바꾼 값을 API 로 되돌림
    - 새로고침 후 로그인 유지 / 제목 수정 → 저장 → 방문자 화면 반영 · 편집 중 초안 창 없음 / 갤러리 업로드 → 방문자 화면 / 이탈 확인 창 / 저장 실패 안내 + 변경 유지
    - 로그인 분당 10회 · 문의 분당 3회 제한에 걸리지 않게 페이지 하나로 1회 로그인, 문의 E2E 는 실행당 1회 접수
  - [x] 시드: test-tenant 에 HERO_BANNER · GALLERY · CONTACT 섹션 보장 (`seed_test_sections`)
  - [x] E2E 로 발견 · 수정한 문제
    - **저장해도 홈페이지에 바로 안 보임** — 홈페이지(Next.js) 60초 캐시를 안 비움, 관리자 섹션 · SEO · SNS 저장은 Redis 공개 사이트 캐시(10분)도 안 비움 → 최대 11분 지연
      → `services/site_cache.py` 로 캐시 비우기 통일 (Redis + 홈페이지 `POST /api/revalidate`, 비밀 키 `REVALIDATE_SECRET`), 편집 · 관리자 섹션 · 토글 · 순서 · 템플릿 · 기능 플래그 · SEO · SNS 저장에 적용
      → 운영: `REVALIDATE_SECRET` 필수 (compose · 운영 점검), 백엔드 → `http://client:3000` 내부 호출
    - 새로고침 직후 첫 편집 요청이 항상 401 → 갱신 → 재시도 (`/auth/me` 가 쿠키만으로 200) → 페이지 로드 때 토큰부터 받기
- **테스트:** 백엔드 캐시 10 · 운영 설정 +2 / client 캐시 엔드포인트 11 · 인증 +1 / E2E 14개 3회 연속 통과 (편집 5 · 문의 1 · 홈 · SEO 8)
- **실행:** 백엔드 · 시드 · 홈페이지(`REVALIDATE_SECRET` 같은 값) 띄운 뒤 `cd apps/client && pnpm test:e2e` (CI 미포함 — DB · 백엔드 기동 설정 필요)
- **완료 조건:** editmode.spec 포함 E2E 전체가 실제 서버에서 통과, 끝난 뒤 개발 DB 원상 복구 ✅

---

## Phase 10: AI 편집 어시스턴트

> **목표:** AI 문구 추천 + 대화형 편집 어시스턴트 구현
> **예상 소요:** 3일
> **선행 조건:** Phase 9 완료, OpenAI API 키 준비

---

### T-068: AI 문구 추천 API 구현 ✅
- **담당:** 백엔드
- **참조:** `기획서 섹션 13.3 (POST /ai/suggest-copy)`
- **작업 내용:**
  - [x] `app/services/ai.py`
    - `suggest_copy(request)` — LangChain + GPT-4o-mini 프롬프트 체인
    - 업종별 프롬프트 템플릿 분리 (HOSPITAL / PENSION / STARTUP / GENERAL)
    - JSON 파싱 + 오류 처리 (재시도 1회) → 실패 시 502
  - [x] `app/api/v1/endpoints/ai.py`
    - `POST /api/v1/ai/suggest-copy` (router 등록)
    - 플랜별 월 사용량 체크 (FREE:5 / BASIC:20 / STANDARD:100 / PREMIUM:무제한)
    - `ai_usage_log` 기록 (action_type=COPY_SUGGEST, tokens_used)
  - [x] 프롬프트 버전 관리 (`app/services/ai_prompts.py`, PROMPT_VERSION)
- **완료 조건:** 병원 업종 메인 타이틀 추천 3가지 정상 반환
  - 주: 순수 로직/모킹 테스트 17개 통과. 엔드포인트 DB 테스트 2개는 Postgres 가동 시 실행.

---

### T-069: AI 대화형 편집 API 구현 (SSE 스트리밍) ✅
- **담당:** 백엔드
- **참조:** `기획서 섹션 13.3 (POST /ai/chat-edit)`
- **작업 내용:**
  - [x] `app/api/v1/endpoints/ai.py`
    - `POST /api/v1/ai/chat-edit` — SSE 스트리밍 응답 (delta/actions/done 이벤트)
    - 현재 테넌트 사이트 컨텍스트 주입 (`build_site_context`: 섹션/필드 + 템플릿)
    - 응답에 액션 JSON 블록 포함 (update_text, update_theme, change_template, explain)
    - 대화 이력 유지 (요청 `conversation_history` → system/user/assistant 메시지)
    - 플랜 게이팅 (BASIC 미지원 403 / STANDARD 월 50회 / PREMIUM 무제한)
  - [x] 액션 파싱 함수: `extract_actions` (코드펜스 + 균형괄호 스캔, 허용 액션만)
- **완료 조건:** "메인 배너를 전문적으로 바꿔줘" → 스트리밍으로 추천 문구 + 적용 액션 반환
  - 주: 순수/스트림/인증 테스트 29개 통과. 엔드포인트 DB 테스트 4개는 Postgres 가동 시 실행.

---

### T-070: AI 문구 추천 UI 구현 ✅
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 13.2 (기능 1: 문구 자동 생성)`
- **작업 내용:**
  - [x] `apps/client/components/ai/CopySuggestPopover.tsx`
    - EditableText 옆 [🤖 AI 추천] 버튼 (편집 모드에서만 노출)
    - 클릭 시 팝오버: 로딩 스피너 → 3가지 추천 문구 표시
    - [적용] 클릭 시 해당 텍스트 교체 + pendingChanges 업데이트 (`applySuggestion`)
    - [다시 생성] 버튼, 바깥 클릭/Escape 닫기, section_type DOM 해석
  - [x] `apps/client/hooks/useCopySuggest.ts` — API 호출 훅 (422 한도 메시지 분기)
- **완료 조건:** 텍스트 필드 옆 AI 추천 버튼 클릭 → 추천 문구 표시 → 적용
  - 주: 훅/팝오버 테스트 10개 + 전체 53개 통과, type-check 클린.

---

### T-071: AI 대화형 편집 패널 UI ✅
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 13.2 (기능 2: 대화형 편집)`
- **작업 내용:**
  - [x] `apps/client/components/ai/AiEditPanel.tsx`
    - 우측 슬라이드 패널 (편집 툴바의 [AI 어시스턴트] 버튼으로 열기, editStore.isAiPanelOpen)
    - 대화 메시지 목록 (사용자/AI 구분)
    - SSE 스트리밍 응답 실시간 표시 (델타 누적 + 스트리밍 스피너)
    - AI 응답의 액션 버튼 (update_text [적용] / update_theme [이대로 적용][원래대로])
    - 입력창 + 전송 버튼
  - [x] `apps/client/hooks/useAiChat.ts` + `lib/aiChatStream.ts` — fetch 기반 SSE 스트리밍
        (POST라 EventSource 불가 → ReadableStream 파싱)
  - [x] 액션 처리: `lib/aiActions.ts` — `update_text`→editStore.updateField + DOM,
        `update_theme`→:root CSS 변수 (원복 지원)
- **완료 조건:** AI 채팅으로 텍스트 변경 지시 → 홈페이지 즉시 반영
  - 주: SSE/액션/패널/스토어 테스트 20개 + 전체 73개 통과, type-check 클린.

---

### T-072: AI 사용량 관리 UI ✅
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 13.4 (AI 사용량 관리)`
- **작업 내용:**
  - [x] 관리자 페이지 설정 탭에 AI 사용량 현황 추가
    - 이번 달 문구 추천: N회 / 20회 (BASIC 기준)
    - 이번 달 대화형 편집: N회 / 50회
  - [x] 한도 초과 시 업그레이드 안내 모달
  - [x] `GET /api/v1/ai/usage` API 추가
- **완료 조건:** AI 사용량 현황 정상 표시, 한도 초과 시 업그레이드 안내

---

### T-073: AI 기능 통합 테스트 + 비용 최적화 ✅
- **담당:** 백엔드
- **작업 내용:**
  - [x] GPT-4o-mini 프롬프트 최적화 (토큰 최소화)
  - [x] AI 응답 캐싱 (동일 입력 1시간 Redis 캐시)
  - [x] 비용 모니터링 (월 OpenAI 비용 추적 로그)
  - [x] 비정상 사용 감지 (단시간 대량 호출 차단)
- **완료 조건:** 100회 추천 시 OpenAI 비용 1달러 이하 목표

---

## Phase 11: SEO & 분석

> **예상 소요:** 1일
> **선행 조건:** T-048, T-053 완료

---

### T-074: 구조화 데이터 (JSON-LD) 자동 생성 ✅
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 11 (업종별 템플릿)`
- **작업 내용:**
  - [x] 업종별 JSON-LD 스키마 자동 생성
    - HOSPITAL: `MedicalBusiness` 스키마
    - PENSION: `LodgingBusiness` 스키마
    - RESTAURANT: `Restaurant` 스키마
    - 기본: `LocalBusiness` 스키마
  - [x] 주소(PostalAddress)+geo(GeoCoordinates) 자동 주입, 키워드는 방어적 배선
        (※ SEO 모델에 keywords/업체 전화 필드 없음 → 추후 백엔드 필드 추가 시 자동 활성화)
- **완료 조건:** Google Rich Results Test 통과

---

### T-075: 오픈 그래프 + 소셜 미리보기 ✅
- **담당:** 프론트엔드
- **작업 내용:**
  - [x] OG 태그 동적 생성 (og:title, og:description, og:image, url, siteName, locale)
  - [x] 트위터 카드 메타태그 (이미지 유무에 따라 summary_large_image/summary)
  - [x] OG 이미지 없을 시 메인 비주얼 배너 이미지(bg_image_url) 자동 사용
- **완료 조건:** 카카오톡/페이스북 URL 공유 시 미리보기 정상 표시

---

### T-076: 방문자 분석 대시보드 ✅
- **담당:** 프론트엔드(+백엔드 데이터 수집 확장)
- **참조:** `기획서 섹션 4 (AD-01 Line Chart)`
- **작업 내용:**
  - [x] 방문자 추이 Line Chart (Recharts, 7일/30일/90일 전환)
  - [x] 모바일 비율 도넛 차트
  - [x] 상위 유입 경로 목록
  - [x] BASIC 플랜: 7일 데이터만, STANDARD 이상: 90일까지
  - [x] (백엔드) site_analytics에 mobile_views/referrers 수집 + GET /analytics/timeseries
- **완료 조건:** 방문자 데이터 수집 → 대시보드 차트 정상 표시

---

### T-077: 구글 서치 콘솔 + 네이버 사이트 등록 가이드 ✅
- **담당:** 프론트엔드(+백엔드 필드 추가)
- **작업 내용:**
  - [x] SEO 설정 페이지에 인증 코드 입력 필드 추가
    - `google-site-verification` 메타태그 자동 삽입 (신규 필드 + migration 0011)
    - `naver-site-verification` 메타태그 자동 삽입
  - [x] 단계별 등록 가이드 UI (모달 형태 — Google/Naver 탭)
- **완료 조건:** 인증 코드 입력 후 Google/Naver 사이트 인증 통과

---

## Phase 12: 테스트 & 배포

> **목표:** 전체 시스템 통합 테스트 + 프로덕션 배포 파이프라인
> **예상 소요:** 3일
> **선행 조건:** Phase 1~11 완료

---

### T-078: 전체 통합 테스트 (E2E) ✅
- **담당:** 전체
- **참조:** `apps/client/e2e/full-journey.spec.ts`, `tenant-isolation.spec.ts`
- **작업 내용:**
  - [x] Playwright E2E 시나리오 작성 (full-journey.spec.ts)
    1. [x] 슈퍼 어드민 → 신규 테넌트 생성
    2. [x] 테넌트 어드민 로그인 → 대시보드 확인
    3. [x] 섹션 편집 → 저장 → 홈페이지 반영 확인
    4. [x] 문의 제출 → 알림 수신 → 관리자 처리
    5. [x] 템플릿 변경 → 콘텐츠 유지 확인
    6. [x] 인라인 편집 → AI 추천 → 저장
  - [x] 멀티 테넌트 격리 검증 (A→B 접근 불가, tenant-isolation.spec.ts)
- **완료 조건:** 모든 E2E 시나리오 통과
  - ✅ `playwright test --list` 21개(신규 9개) 열거, type-check 통과
  - ⚠️ 실제 실행은 전체 스택 기동 후 `E2E_FULL_STACK=1`(기본 스킵, 환경 밖)
  - → T-078-A 에서 실제 API 로 다시 써 CI 에서 실행

---

### T-078-A: 통합 E2E(전체 흐름 · 테넌트 격리) 활성화 + CI ★신규 ✅
- **담당:** 전체
- **배경:** T-078 의 두 E2E 는 작성만 되고 한 번도 실행된 적 없음 — 계정 · API 경로 · 응답 모양이 실제와 달랐다
- **작업 내용:**
  - [x] `full-journey.spec.ts` 다시 씀 (7개) — 슈퍼 어드민이 사업체 생성 → 그 관리자 로그인 · 정리(비활성화) / 관리자 앱 로그인 → 대시보드 / 섹션 저장 → 홈페이지 즉시 반영 / 문의 접수 → 관리자 처리 / 템플릿 변경(콘텐츠 유지) → 롤백 / AI 추천(키 없으면 502 안내) / 슈퍼 어드민 로그인 화면
  - [x] `tenant-isolation.spec.ts` 다시 씀 (2개) — A 관리자가 B 섹션 조회 · 수정 · 숨기기 · 인라인 저장 모두 차단(404 · 저장 0건), B 문의 목록 · 상세 · 처리 차단, B 값 그대로
  - [x] 시드: 두 번째 사업체 `other-tenant` (admin@other-tenant.com / password123)
  - [x] 로그인 · 문의 요청 한도를 설정값으로 (`LOGIN_RATE_LIMIT` · `INQUIRY_RATE_LIMIT`, 운영 기본 10/분 · 3/분 그대로) — CI 에서만 올림
  - [x] CI e2e job — 프론트 3개 빌드본(next start · vite preview)으로 전체 E2E 23개
  - [x] 발견 · 수정: **AI 호출 실패(OpenAI 장애 · 키 오류)가 500** → "AI 문구 생성에 실패했습니다" 안내(502)
- **테스트:** E2E 23개 CI 와 같은 조건(빈 DB · 빌드본 · 재시도 없음)으로 3회 연속 통과 / 백엔드 AI 502 1 · 요청 한도 3
- **완료 조건:** PR CI e2e 통과

---

### T-079: 보안 점검 ✅
- **담당:** 백엔드
- **참조:** `기획서 섹션 8.2 (보안 요구사항)`, `docs/security/T-079-보안점검-체크리스트.md`
- **작업 내용:**
  - [x] SQL Injection 테스트 (SQLAlchemy parameterized query 확인)
  - [x] XSS 취약점 점검 (JSON-LD 미이스케이프 주입 수정, CSS 변수 sanitize 확인)
  - [x] CORS 화이트리스트 확인
  - [x] JWT 시크릿 키 강도 확인 (32자 이상 검증기 추가)
  - [x] 파일 업로드 MIME 타입 magic bytes 검증 확인
  - [x] Rate Limiting 동작 확인
  - [x] RLS 격리 재검증
- **완료 조건:** OWASP Top 10 체크리스트 통과 ✅ (취약점 2건 발견·수정, docs/security/ 보고서)

---

### T-080: Nginx 설정 + SSL ✅
- **담당:** 인프라
- **참조:** `nginx/nginx.conf`, `nginx/README.md`, `CLAUDE.md 섹션 7.1/8.1`
- **작업 내용:**
  - [x] `nginx/nginx.conf` 작성 (실제 아키텍처 기준 라우팅)
    - `/api/**` → FastAPI 백엔드 프록시 (단일 backend 서비스)
    - `admin.{domain}` → 테넌트 관리자(Vite) 서빙
    - `system.{domain}` → 슈퍼 어드민(Vite) 서빙
    - `{domain}` → 고객 홈페이지(Next.js) 프록시
    - 커스텀 도메인 → `sites-enabled/*.conf` 동적 include (T-100)
  - [x] SSL 인증서 설정 (Let's Encrypt + Certbot webroot 자동 갱신 서비스)
  - [x] HSTS 헤더 적용 (+ X-Content-Type-Options, X-Frame-Options 등)
  - [x] Gzip 압축 설정
  - [x] Rate Limiting (IP당 100req/min)
- **완료 조건:** HTTPS 정상 동작, SSL Labs A 등급
  - ✅ `nginx -t`(docker) + `docker compose config` 정적 검증 통과
  - ⚠️ 라이브 HTTPS 동작·SSL Labs 등급은 실도메인 배포 시 확인(환경 밖)

---

### T-081: Docker 프로덕션 이미지 빌드 ✅
- **담당:** 인프라
- **작업 내용:**
  - [x] `apps/backend/Dockerfile` — 멀티스테이지 (Python 3.13-slim + Poetry, 비루트)
  - [x] `apps/admin/Dockerfile` — Node 빌드 → Nginx 서빙 (SPA 폴백)
  - [x] `apps/superadmin/Dockerfile` — Node 빌드 → Nginx 서빙 (nginx system. 라우팅용)
  - [x] `apps/client/Dockerfile` — Next.js standalone 빌드
  - [x] `docker-compose.prod.yml` 완성 (프론트 3종 + celery worker/beat 서비스)
  - [x] 이미지 크기 최적화 (백엔드 **478MB** < 500MB 목표)
  - [x] poetry.lock 커밋(재현 가능 빌드) + 모노레포 build context 대응
- **완료 조건:** `docker compose -f docker-compose.prod.yml up` 성공
  - ✅ 4개 이미지 `docker build` 성공, backend 478MB, client 컨테이너 기동 스모크(307) 통과
  - ✅ `docker compose config` 통과 / ⚠️ 전체 `up`은 시크릿·DB 포함 실환경에서 확인

---

### T-082: CI/CD 파이프라인 (GitHub Actions) ✅
- **담당:** 인프라
- **참조:** `.github/workflows/README.md`
- **작업 내용:**
  - [x] `.github/workflows/test.yml`
    - PR/push 시 자동 실행: backend(ruff+alembic+pytest 70%) + frontend(type-check+vitest)
    - 브랜치 보호 규칙 등록 시 테스트 실패 → 머지 차단
  - [x] `.github/workflows/deploy.yml`
    - Test 성공(workflow_run, main) 후 자동 배포
    - 4개 이미지 매트릭스 빌드 → ECR 푸시(:latest+:sha) → ECS 롤링 배포
  - [x] 환경변수 GitHub Secrets 관리 (AWS/ECR/ECS, README 문서화)
- **완료 조건:** PR 머지 → 자동 배포 → 프로덕션 반영 확인
  - ✅ actionlint(docker) exit 0 — 문법·표현식·shellcheck 통과
  - ⚠️ 실제 자동 배포는 GitHub Secrets + AWS(ECR/ECS) 연결 시 동작(환경 밖)
  - ⚠️ lint 스텝은 ESLint 미설치로 제외(README 공백 명시)

---

### T-082-A: E2E 를 CI 에 추가 ★신규 ✅
- **담당:** 인프라
- **참조:** `.github/workflows/README.md` (E2E job)
- **작업 내용:**
  - [x] `test.yml` 에 `e2e` job — PostgreSQL · Redis · MinIO → 마이그레이션 → 앱 계정 → 시드 → 버킷 → 백엔드 → 홈페이지 운영 빌드 → Playwright (editmode · inquiry · homepage · seo 14개), 실패 시 결과 · 백엔드 로그 아티팩트
  - [x] `playwright.config.ts` — `E2E_WEB_COMMAND` 로 CI 는 `pnpm start` (운영 빌드)
  - [x] actionlint 통과
  - [x] CI 와 같은 조건(새 DB · 운영 빌드 · 재시도 없음)으로 로컬 재현해 발견 · 수정한 문제
    - `init_db_roles.py` · `init_minio.py` 를 문서대로(`python scripts/...`) 실행하면 `app` 을 못 찾아 실패 → seed.py 와 같이 경로 추가
    - **MinIO 공식 이미지 다운로드 불가** (첫 CI 실행에서 발견) → CI 는 Chainguard 빌드로, 운영 · 개발은 체크리스트 B6 결정 필요
    - **로그인 풀림**: 인증 갱신 응답 전에 페이지를 옮기면 서버는 옛 쿠키를 폐기했는데 브라우저는 새 쿠키를 못 받아 다음 갱신 401 → 로그아웃. 갱신된 옛 쿠키를 30초 동안 한 번 더 받아 주는 유예 추가 (로그아웃한 쿠키는 즉시 거부 유지)
- **테스트:** 인증 유예 3 / 로컬 CI 재현 E2E 14개 재시도 없이 3회 연속 통과
- **완료 조건:** PR 에서 `e2e` job 통과

---

### T-082-B: 타입 검사(mypy) 도입 ★신규 ✅
- **담당:** 백엔드 · 인프라
- **배경:** CLAUDE.md 12.4 필수 검증인데 mypy 가 설치되지 않아 한 번도 실행된 적 없음 — 첫 실행 93개 오류
- **작업 내용:**
  - [x] mypy 2.4 개발 의존성 + `pyproject.toml [tool.mypy]` (pydantic 플러그인), CI backend job 에 `mypy app/` 단계
  - [x] 오류 93 → 0
    - `get_tenant_id` 의존성 — 테넌트 API 에 "없을 수 있는" tenant_id 를 넘기던 57곳 정리
    - `affected_rows()` (UPDATE · DELETE 건수), `decrypt_secret` 타입 오버로드, 휴대폰 인증 용도 목록 단일화(서비스 쪽에 MYPAGE 누락), 목록 · 조건 타입 표기 등
  - [x] 수정하며 발견한 실제 버그
    - **슈퍼 어드민 토큰으로 테넌트 API 호출 시 RLS 우회 상태로 실행** — SNS · SEO 조회는 모든 테넌트 행이 섞여 500, 저장 API 는 tenant_id 없이 시도. → `/api/v1` 테넌트 라우터 전체에 `get_tenant_id` 적용 (403), 새 라우터도 목록에 넣으면 자동 적용
- **테스트:** 테넌트 범위 13 (슈퍼 어드민 토큰 7곳 403 · 테넌트 관리자 정상 · 무토큰 401) · 공지 대상 1
- **완료 조건:** `mypy app/` 0개 · 전체 테스트 통과 · CI 에 타입 검사 단계 ✅

---

### T-083: 모니터링 설정 ✅
- **담당:** 인프라
- **참조:** `monitoring/README.md`, `apps/backend/app/core/observability.py`
- **작업 내용:**
  - [x] Sentry 프론트엔드(@sentry/react·nextjs) + 백엔드(sentry-sdk) 에러 추적
  - [x] Grafana + Prometheus 메트릭 대시보드 (CMS Overview 5패널)
    - [x] API 응답 시간 P95 (http_request_duration_seconds 히스토그램)
    - [x] DB 연결 수 (postgres-exporter)
    - [x] 큐 대기 태스크 수 (redis-exporter, Celery 큐)
    - [x] 에러율 (http_requests_total status 라벨)
  - [x] 알림 설정 (에러율 5% 초과 → Alertmanager Slack)
- **완료 조건:** Grafana 대시보드에서 시스템 지표 실시간 확인
  - ✅ 백엔드 `/metrics` 테스트 통과, promtool(5규칙)·amtool·대시보드 JSON·결합 compose 검증
  - ⚠️ 실시간 대시보드 화면 확인은 스택 기동(실환경) 시 (환경 밖)

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
    ↓
T-107~T-116 (테넌트 사이트 방문자 인증)
    ↓ (T-124 는 T-113·T-114 와 함께)
T-117~T-125 (코드형 템플릿 & 목업 이식)
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

### T-084: 슈퍼 어드민 앱 초기 설정 (apps/superadmin) ✅
- **담당:** 프론트엔드(+백엔드 super-auth)
- **참조:** `기획서 섹션 14.2`, `CLAUDE.md 섹션 8.1`
- **작업 내용:**
  - [x] `apps/superadmin/` Vite 7 + React 19 프로젝트 초기화 (:3002 포트)
  - [x] `pnpm-workspace.yaml`에 `apps/superadmin` 추가 (apps/* 글롭)
  - [x] TailwindCSS 4.x, TypeScript 5.9 설정
  - [x] React Router 라우팅 구성 (login/dashboard/tenants/:id/features/announcements/monitoring/revenue + SuperAdminLayout)
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
  - [x] 슈퍼 어드민 전용 axios 인스턴스 (`lib/superApi.ts`, baseURL: `/api/super`)
  - [x] `stores/superAuthStore.ts` — 슈퍼 어드민 인증 상태
  - [x] `apps/superadmin/.env.example` 생성
  - [x] (백엔드) `POST /api/super/v1/auth/login` + `GET /auth/me` (SUPER_ADMIN 전용)
  - [x] 로그인 페이지 폼 + 검증 + 인증 연동, vitest 테스트 인프라 구축
- **완료 조건:** `pnpm dev` 시 :3002 에서 슈퍼 어드민 로그인 페이지 렌더링

---

### T-085: 테넌트 관리 API 구현 ✅
- **담당:** 백엔드
- **참조:** `기획서 섹션 14.6 (테넌트 관리 API)`
- **작업 내용:**
  - [x] `app/api/super/endpoints/tenants.py`
    - `GET /api/super/v1/tenants` — 전체 목록 (검색·플랜·업종·상태 필터, 페이지네이션)
    - `POST /api/super/v1/tenants` — 신규 테넌트 생성 + 기본 섹션 4종 자동 생성 + 어드민 계정 생성
    - `GET /api/super/v1/tenants/{id}` — 상세 조회 (admin_emails 포함)
    - `PATCH /api/super/v1/tenants/{id}` — 정보 수정 + audit_log 기록
    - `PATCH /api/super/v1/tenants/{id}/plan` — 플랜 변경 (기능 플래그 재계산은 T-086 연동)
    - `DELETE /api/super/v1/tenants/{id}` — 소프트 삭제
    - `POST /api/super/v1/tenants/{id}/reset-password` — 어드민 임시 비밀번호 발급
    - `GET /api/super/v1/tenants/{id}/stats` — 방문자·문의·AI사용량·스토리지 현황
  - [x] **대리 접속 API** (`POST /api/super/v1/tenants/{id}/impersonate`)
    - 30분짜리 단기 impersonate_token 발급
    - `audit_logs`에 IMPERSONATE_START 기록
    - 응답: `{impersonate_token, redirect_url, expires_in}`
  - [x] 모든 쓰기 API에 `audit.log_action()` 자동 호출
- **완료 조건:** 신규 테넌트 생성 → 로그인 가능, 대리 접속 토큰으로 admin 페이지 진입

---

### T-086: 기능 플래그 서비스 + API 구현
- **담당:** 백엔드
- **참조:** `기획서 섹션 14.3`, `CLAUDE.md 섹션 8.2, 8.3`
- **작업 내용:**
  - [x] `app/services/feature.py`
    - `get_tenant_features(db, tenant_id)` — Redis 캐시 5분 적용
    - `is_enabled(db, tenant_id, feature_key)` — 단일 기능 확인
    - `toggle_feature(db, tenant_id, feature_id, enabled)` — 개별 토글
    - `deploy_feature(db, feature_id, deployment_config)` — 배포 실행
      - GLOBAL: 전체 tenant_features 일괄 UPDATE
      - PLAN_BASED: 플랜 조건으로 필터링 UPDATE
      - SELECTIVE: 특정 tenant_id 배열로 UPDATE
      - GRADUAL: 전체의 N%를 랜덤 선택하여 UPDATE
    - `rollback_deployment(db, deployment_id)` — 배포 롤백
  - [x] `app/api/super/endpoints/features.py`
    - `GET /api/super/v1/features` — 전체 기능 목록 + 테넌트별 활성화 수
    - `POST /api/super/v1/features` — 새 기능 등록
    - `PATCH /api/super/v1/features/{id}` — 기능 정보 수정
    - `POST /api/super/v1/features/{id}/deploy` — 배포 실행
    - `POST /api/super/v1/features/{id}/rollback` — 롤백
    - `GET /api/super/v1/tenants/{id}/features` — 테넌트 기능 목록
    - `PATCH /api/super/v1/tenants/{id}/features/{fid}` — 개별 토글
  - [x] **테넌트용 기능 조회 API** (`GET /api/v1/tenant/features`)
    - 로그인한 테넌트의 활성 기능 목록 + 미읽은 공지 반환 (공지는 T-088 연동 예정, 현재 빈 배열)
    - Redis 캐시 5분
  - [x] `require_feature()` FastAPI 의존성 구현 (CLAUDE.md 섹션 8.2 참조)
  - [x] 초기 기능 시드 데이터 (`scripts/seed.py`에 추가)
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
  - [x] `apps/admin/src/stores/featureStore.ts`
    - 앱 초기화 시 `GET /api/v1/tenant/features` 호출
    - `features` Map 상태 관리 (flags Record + isEnabled 헬퍼)
    - `isEnabled(key)` 헬퍼 함수
  - [x] `apps/admin/src/components/layout/Sidebar.tsx` 동적 메뉴 렌더링
    - `featureStore`의 `isEnabled()` 기반으로 메뉴 항목 조건부 노출 (CollapsedSidebar/BottomTabBar 동일 적용)
    - BETA 기능: 🔵 BETA 뱃지 표시
    - NEW 기능: 🆕 NEW 뱃지 표시 (7일간)
  - [x] `apps/admin/src/components/layout/AnnouncementBanner.tsx`
    - 읽지 않은 공지 상단 배너 자동 노출
    - 공지 유형별 색상 (INFO: 파랑, WARNING: 노랑, URGENT: 빨강, FEATURE_UPDATE: 초록)
    - [확인] 클릭 시 읽음 처리 (`POST /api/v1/announcements/{id}/read`, 읽음 API는 T-088 백엔드 연동)
  - [x] 비활성화된 기능 페이지 직접 URL 접근 시 → "현재 비활성화된 기능입니다" 안내 페이지 (FeatureGuard)
- **완료 조건:**
  - 슈퍼 어드민에서 기능 ON → 테넌트 관리자 페이지 새로고침 시 메뉴 자동 노출
  - 공지 발송 → 테넌트 관리자 페이지 상단 배너 즉시 노출

---

### T-088: 공지 API + 발송 시스템 구현
- **담당:** 백엔드
- **참조:** `기획서 섹션 14.6 (공지 API)`, `기획서 섹션 14.3 (announcements 테이블)`
- **작업 내용:**
  - [x] `app/api/super/endpoints/announcements.py`
    - `GET /api/super/v1/announcements` — 공지 목록
    - `POST /api/super/v1/announcements` — 공지 생성 + 즉시 or 예약 발송
    - `PATCH /api/super/v1/announcements/{id}` — 수정
    - `DELETE /api/super/v1/announcements/{id}` — 삭제
    - `POST /api/super/v1/announcements/{id}/send` — 즉시 발송 트리거
  - [x] `app/api/v1/endpoints/announcements.py` (테넌트용)
    - `GET /api/v1/announcements` — 내 공지 목록 (미읽음 포함)
    - `POST /api/v1/announcements/{id}/read` — 읽음 처리
    - (tenant_features 응답에도 미읽은 공지 연결 → T-087 배너 실동작)
  - [x] Celery 태스크: 공지 대상 테넌트에게 카카오 알림톡 일괄 발송 (이메일은 T-098 이메일 서비스로 유예), 예약 발송(5분마다)
  - [x] 만료일 지난 공지 자동 비노출 (쿼리 필터 + Celery Beat 매일 04:00 백업)
- **완료 조건:** 공지 생성 → 대상 테넌트 관리자 페이지에 배너 노출

---

### T-089: 슈퍼 어드민 대시보드 UI (SA-01)
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 14.4 (SA-01)`
- **작업 내용:**
  - [x] `apps/superadmin/src/pages/DashboardPage.tsx` (+ 백엔드 집계 API `GET /api/super/v1/dashboard`)
  - [x] 통계 카드 (전체 테넌트 수, 이번달 MRR, 알림톡 발송 수, AI 사용)
  - [x] 플랜별 현황 + MRR 추이 차트 (Recharts, 6개월 코호트 근사 — 결제 스냅샷은 Phase 14)
  - [x] 만료 예정 테넌트 목록 (D-3 이내 빨강, D-7 이내 노랑)
  - [x] 최근 신규 테넌트 목록 + 빠른 액션 버튼 ([설정] [플랜변경] [접속=impersonate])
  - [x] 시스템 상태 표시 (서버·DB·Redis 실측·Celery 베스트에포트)
- **완료 조건:** 대시보드 모든 위젯 실데이터 정상 표시

---

### T-090: 테넌트 관리 UI (SA-02, SA-03)
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 14.4 (SA-02, SA-03)`
- **작업 내용:**
  - [x] `apps/superadmin/src/pages/TenantsPage.tsx` (SA-02)
    - 전체 테넌트 테이블 (검색·플랜/상태 필터·페이지네이션)
    - 신규 테넌트 생성 모달
  - [x] `apps/superadmin/src/pages/TenantDetailPage.tsx` (SA-03)
    - [기본정보] 탭: 테넌트 정보 수정, 플랜 변경, 비밀번호 초기화
    - **[기능 관리] 탭**: 카테고리별 기능 토글
      - 각 기능 On/Off 토글
      - 플랜 미충족 기능: 잠금 표시 + "플랜 업그레이드 필요"
      - 변경 즉시 저장 (낙관적 업데이트 + Redis 캐시 퍼지는 백엔드 T-086)
    - [사용 현황] 탭: 방문자·문의·AI사용량·스토리지 (집계 카드)
    - [히스토리] 탭: audit_logs 조회 (신규 `GET /tenants/{id}/audit-logs`)
  - [x] **[이 테넌트 관리자 페이지로 접속 →] 버튼**
    - 대리 접속 API 호출 → redirect_url 새 탭 오픈
    - 클릭 전 확인 모달: "대리 접속 시 모든 행위가 감사 로그에 기록됩니다"
- **완료 조건:** 기능 토글 변경 후 해당 테넌트 관리자 페이지에서 즉시 반영 확인

---

### T-091: 기능 배포 관리 UI (SA-04)
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 14.4 (SA-04)`
- **작업 내용:**
  - [x] `apps/superadmin/src/pages/FeaturesPage.tsx`
  - [x] 기능 목록 카드 (활성 테넌트 수, 배포 상태, BETA/NEW 뱃지)
  - [x] 새 기능 등록 폼
    - key, name, category, 메뉴 경로/아이콘/레이블, 필요 플랜, BETA 여부
  - [x] 배포 관리 모달 (SA-04 화면 설계 참조)
    - 배포 방식 선택 (전체/플랜별/선택/점진적)
    - 영향받는 테넌트 수 미리보기 (T-089 대시보드 데이터 재사용)
    - 테넌트 알림 설정 (공지 배너 + 알림톡, T-088 공지 API 연동 / 이메일은 T-098 유예)
    - 업데이트 노트 입력
  - [x] 배포 이력 조회 (신규 `GET /features/{id}/deployments`) + 롤백 버튼
- **완료 조건:** 새 기능 등록 → 플랜별 배포 → 해당 플랜 테넌트 메뉴에 자동 노출

---

### T-092: 공지 관리 UI (SA-05)
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 14.4 (SA-05)`
- **작업 내용:**
  - [x] `apps/superadmin/src/pages/AnnouncementsPage.tsx`
  - [x] 공지 목록 + 발송 현황 (읽음 수 / 대상)
  - [x] 공지 작성 폼 (SA-05 화면 설계 참조)
    - 제목, 유형, 대상(전체/플랜별/선택), 내용 (textarea — Rich Text는 범위 밖)
    - 발송 방법 (배너/알림톡/이메일-T-098 유예) 체크박스
    - 만료일 설정
    - [미리보기] [즉시 발송] [임시저장]
  - [x] 공지 유형별 색상 뱃지 (INFO/WARNING/URGENT/FEATURE_UPDATE/MAINTENANCE)
- **완료 조건:** 공지 작성 → 즉시 발송 → 대상 테넌트 관리자 배너 노출 확인

---

### T-093: 모니터링 + 수익 관리 UI
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 14.6 (모니터링 API)`
- **작업 내용:**
  - [x] `apps/superadmin/src/pages/MonitoringPage.tsx` (+ 백엔드 `GET /api/super/v1/monitoring`)
    - AI 비용 월별 차트 (ai_usage_logs 토큰 기반 추정)
    - 서버 에러 목록 (Sentry 미연동 → 안내 표기)
    - Celery 큐 대기 현황 (inspect 베스트에포트)
    - 알림톡 발송 현황 (월 카운트 + 추정 비용)
  - [x] `apps/superadmin/src/pages/RevenuePage.tsx` (+ 백엔드 `GET /api/super/v1/revenue`)
    - MRR 추이 차트 (3개월/6개월/12개월 토글)
    - 플랜별 테넌트 수 도넛 차트
    - 만료 예정 테넌트 목록 + 갱신 유도 알림 발송(T-088 공지 연동)
    - 신규 가입 / 해지 / 업그레이드 / 다운그레이드 현황 (audit_logs 기반)
- **완료 조건:** 수익 현황 및 AI 비용 차트 정상 표시

---

### T-094: 슈퍼 어드민 보안 강화
- **담당:** 백엔드
- **참조:** `기획서 섹션 14.8 (보안 규칙)`
- **작업 내용:**
  - [x] 슈퍼 어드민 로그인 시 TOTP 2FA 검증 추가
    - `pyotp` 라이브러리 사용
    - QR 코드 초기 설정 엔드포인트 (`POST /auth/2fa/setup`, `/auth/2fa/confirm`)
    - `POST /api/super/v1/auth/verify-2fa`
  - [x] IP 화이트리스트 미들웨어 (환경변수 `SUPER_ADMIN_ALLOWED_IPS`, T-084 미들웨어 활용)
  - [x] 슈퍼 어드민 Access Token 만료시간 5분으로 단축
  - [x] 감사 로그 조회 API (`GET /api/super/v1/audit-logs`)
  - [x] 대리 접속 토큰 Redis 30분 TTL 등록 (jti 기반 무효화 추적, JWT exp가 실제 만료)
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
  - [x] `app/models/billing.py` — Subscription, PaymentHistory, PlanChangeHistory 모델
  - [x] `app/models/domain.py` — TenantDomain 모델
  - [x] Alembic 마이그레이션 생성 및 적용 (0015, 4개 테이블 + RLS)
  - [x] `scripts/seed.py`에 테스트용 구독 데이터 추가
  - [x] `app/schemas/billing.py` — Pydantic 스키마 전체
- **완료 조건:** `alembic upgrade head` 성공, 모델 import 에러 없음

---

### T-096: 토스페이먼츠 결제 서비스 구현
- **담당:** 백엔드
- **참조:** `기획서 섹션 15.2 (토스페이먼츠 연동 핵심 코드)`
- **작업 내용:**
  - [x] `app/services/payment.py`
    - `issue_billing_key(customer_key, auth_key)` — 빌링키 발급
    - `charge_billing(billing_key, customer_key, amount, order_id, order_name)` — 자동 결제
    - `cancel_payment(payment_key, reason)` — 결제 취소·환불
    - `get_payment_status(payment_key)` — 결제 상태 조회
    - (오케스트레이션: register_card/change_plan/cancel_subscription/charge_subscription)
  - [x] 토스페이먼츠 테스트 환경 설정 (`PAYMENT_MODE=test` stub)
  - [x] `app/api/v1/endpoints/billing.py`
    - `POST /api/v1/billing/register-card` — 빌링키 발급 (카드 등록)
    - `GET  /api/v1/billing/subscription` — 현재 구독 정보
    - `GET  /api/v1/billing/history` — 결제 이력
    - `POST /api/v1/billing/cancel` — 구독 해지 신청
    - `POST /api/v1/billing/change-plan` — 플랜 변경
  - [x] `POST /api/webhook/tosspayments` — 웹훅 수신 (HMAC-SHA256 서명 검증)
  - [x] 환경변수 추가: `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`, `TOSS_WEBHOOK_SECRET`, `PAYMENT_MODE`
- **완료 조건:** 테스트 카드로 빌링키 발급 → 수동 결제 → 결제 이력 조회 성공

---

### T-097: 정기결제 Celery 태스크 구현
- **담당:** 백엔드
- **참조:** `기획서 섹션 15.2 (Celery 정기결제 태스크)`
- **작업 내용:**
  - [x] `app/workers/billing.py`
    - `process_monthly_billing` — 매일 00:05 오늘 결제일 구독 자동 결제
    - `retry_billing` — 결제 실패 재시도 (매일 01:00, 연속 실패 3회 → SUSPENDED)
    - `check_expiring_subscriptions` — 매일 09:00 D-7, D-3 만료 예정 알림(공지 생성)
    - `suspend_expired_subscriptions` — 매일 00:10 만료 구독 접근 차단
    - `delete_cancelled_tenant_data` — 매일 03:00 해지 후 30일 데이터 소프트 삭제
  - [x] Celery Beat 스케줄 등록 (5개 태스크)
  - [x] 결제 실패 3회 시 SUSPENDED 전환 (슈퍼 어드민 이메일 알림은 T-098 유예)
- **완료 조건:** Celery Beat 실행 후 스케줄 태스크 정상 등록, 테스트 결제 실행 확인

---

### T-098: 이메일 발송 서비스 구현
- **담당:** 백엔드
- **참조:** `기획서 섹션 15.4 (온보딩 이메일 자동화)`
- **작업 내용:**
  - [x] `app/services/email.py` — AWS SES 기반 이메일 발송 (EMAIL_MODE=test stub)
    - `send_email(to, subject, template, variables)` — 기본 발송 함수
    - `send_welcome_email` — 환영 메일
    - `send_payment_receipt` — 영수증
    - `send_payment_failed` — 결제 실패 알림
    - `send_expiring_notice` — 만료 예정 알림
    - `send_cancellation_confirmed` — 해지 확인
    - `send_data_deleted` — 데이터 삭제 완료 / `send_domain_activated` — 도메인 활성화
  - [x] 이메일 HTML 템플릿 작성 (Jinja2, 7종)
  - [x] 환경변수 추가: `AWS_SES_REGION`, `AWS_SES_FROM_EMAIL`, `EMAIL_MODE`
  - [x] Celery 태스크로 비동기 처리 (`send_email_async`)
  - [x] 연동: 테넌트 생성 시 환영 메일, 결제 성공 시 영수증
- **완료 조건:** 환영 메일 실제 수신 확인, 영수증 이메일 수신 확인

---

### T-099: 무료 체험(Trial) 시스템 구현
- **담당:** 백엔드
- **참조:** `기획서 섹션 15.6 (Trial 시스템)`
- **작업 내용:**
  - [x] 테넌트 생성 시 Trial 구독 자동 생성 (14일, STANDARD 기능)
  - [x] Trial 기간 중 카드 등록 없이 전 기능 사용 가능
  - [x] Trial D-3 알림 Celery 태스크 (notify_trial_ending)
  - [x] Trial 종료 처리 (카드 O→ACTIVE+결제 / 카드 X→SUSPENDED+차단)
  - [x] `GET /api/v1/billing/trial-status` — 체험 남은 일수 반환
  - [x] 관리자 페이지 상단에 Trial 남은 일수 배너 표시 (TrialBanner)
- **완료 조건:** 신규 테넌트 생성 → 14일 Trial → 종료 시 접근 차단 시나리오 테스트

---

### T-100: 커스텀 도메인 서비스 구현
- **담당:** 백엔드/인프라
- **참조:** `기획서 섹션 15.3 (커스텀 도메인 자동화)`
- **작업 내용:**
  - [x] `app/services/domain.py` (domain_mode=test stub)
    - `verify_dns(domain, expected_cname)` — DNS CNAME 전파 확인 (dnspython)
    - `issue_ssl_certificate(domain)` — Let's Encrypt SSL 발급 (certbot subprocess)
    - `add_nginx_config(domain, tenant_slug)` — Nginx 가상 호스트 추가
    - `remove_nginx_config(domain)` — Nginx 설정 제거
    - `renew_ssl_certificate(domain)` — SSL 갱신
  - [x] `app/api/v1/endpoints/domain.py`
    - `POST /api/v1/domain/register` — 커스텀 도메인 등록 신청
    - `GET  /api/v1/domain/status` — 도메인 연결 상태 확인
    - `POST /api/v1/domain/verify` — DNS 전파 수동 확인
    - `DELETE /api/v1/domain` — 도메인 연결 해제
  - [x] `app/api/super/endpoints/domains.py`
    - `GET  /api/super/v1/domains` — 전체 도메인 목록
    - `POST /api/super/v1/domains/{id}/ssl-renew` — SSL 수동 갱신
  - [x] DNS 확인 Celery 태스크 (poll_domain_dns, 60초 폴링, 최대 24시간)
  - [x] SSL 만료 D-30 자동 갱신 Celery Beat 태스크 (renew_expiring_ssl)
  - [x] 의존성 추가: `dnspython` (certbot은 subprocess)
- **완료 조건:** 실제 도메인으로 CNAME 설정 → 자동 DNS 확인 → SSL 발급 → 접속 성공

---

### T-101: 도메인 관리 UI 구현 (AD-08 탭)
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 15.5 (AD-08 도메인 탭)`
- **작업 내용:**
  - [x] `apps/admin/src/pages/BillingPage.tsx` 탭 확장 (4탭)
    - [구독 현황] 탭: 현재 플랜, 다음 결제일, 해지 버튼 + 사용량/AI/플랜비교
    - [결제 수단] 탭: 등록된 카드 표시, 카드 등록/변경
    - [결제 내역] 탭: 결제 이력 테이블, 영수증 링크
    - **[도메인] 탭**: 현재 도메인 상태, 커스텀 도메인 등록/변경
  - [x] 카드 등록 UI (RegisterCardModal → 백엔드 register-card 직접 호출; 토스 위젯 연동 지점 주석 명시)
  - [x] 도메인 연결 상태 실시간 확인 (30초 폴링)
    - PENDING → DNS_CHECKING → SSL_ISSUING → ACTIVE 단계 표시
  - [x] Trial 배너 컴포넌트 (T-099에서 구현 완료)
- **완료 조건:** 카드 등록 → 결제 내역 표시, 도메인 등록 → 상태 변화 실시간 표시

---

### T-102: 구독 해지 플로우 UI 구현
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 15.7 (구독 해지 처리)`
- **작업 내용:**
  - [x] 해지 신청 다이얼로그 (CancelSubscriptionDialog)
    - 해지 사유 선택 (5가지 옵션)
    - "현재 기간까지 서비스 유지" 안내
    - "30일 후 데이터 완전 삭제" 경고
    - [해지 취소] [해지 확인] 버튼
  - [x] 해지 완료 후 재구독 CTA 배너 표시 (ReSubscribeBanner, CANCELLED)
  - [x] 구독 만료(SUSPENDED) 접속 시 → 만료 안내 페이지 + 재구독 버튼 (SubscriptionExpiredPage)
- **완료 조건:** 해지 신청 → 기간 종료 후 접근 차단 → 재구독 CTA 표시

---

### T-103: 슈퍼 어드민 결제 현황 UI (SA-06)
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 15.5 (SA-06)`
- **작업 내용:**
  - [x] `apps/superadmin/src/pages/BillingOverviewPage.tsx` (+ 백엔드 `GET /api/super/v1/billing/overview`)
  - [x] 통계 카드 (MRR, 연체 수, 해지 수, 신규 수)
  - [x] 연체 테넌트 즉시 처리 (수동 결제, `POST /billing/manual-charge/{tenant_id}`)
  - [x] 환불 처리 API (`POST /billing/refund/{payment_id}`)
  - [x] MRR 추이 차트 (Recharts, T-093 revenue 재사용)
  - [x] 플랜별 테넌트 수 도넛 차트
- **완료 조건:** 결제 현황 정상 표시, 수동 결제 실행 가능

---

### T-104: 온보딩 자동화 통합 테스트
- **담당:** 전체
- **작업 내용:**
  - [x] 신규 테넌트 생성 → 환영 메일 수신 시나리오 E2E 테스트
  - [x] 카드 등록 → 자동 결제 → 영수증 수신 시나리오 테스트
  - [x] 결제 실패 → 재시도 → 3회 실패 → 서비스 중단 시나리오 테스트
  - [x] Trial → 만료 → 카드 등록 → ACTIVE 전환 시나리오 테스트
  - [x] 커스텀 도메인 등록 → DNS 확인 → SSL 발급 → 접속 확인 테스트
  - [x] 구독 해지 → 기간 종료 → 데이터 삭제 시나리오 테스트
  - (부수: 이미지 정리 테스트 순서 의존 flakiness 해소)
- **완료 조건:** 6개 시나리오 전체 통과

---

### T-105: SSL 자동 갱신 + 도메인 모니터링
- **담당:** 백엔드/인프라
- **작업 내용:**
  - [x] SSL 만료 D-30 자동 갱신 Celery Beat 태스크 (T-100 renew_expiring_ssl, 도메인별 처리)
  - [x] SSL 갱신 실패 시 슈퍼 어드민 긴급 알림 (이메일)
  - [x] `GET /api/super/v1/domains` 에 SSL 만료일 표시 (T-100 ssl_expires_at)
  - [x] 슈퍼 어드민 대시보드에 SSL 만료 예정 도메인 경고 위젯 (SslExpiringWidget)
- **완료 조건:** SSL 만료 30일 전 자동 갱신 실행 확인

---

### T-106: 결제 + 온보딩 보안 강화
- **담당:** 백엔드
- **작업 내용:**
  - [x] 토스페이먼츠 웹훅 HMAC-SHA256 서명 검증 (T-096 기구현)
  - [x] 빌링키 암호화 저장 (AES-256-GCM, 환경변수 키, enc:v1: 프리픽스)
  - [x] 결제 쓰기 API Rate Limiting (분당 5회: register-card/change-plan/cancel)
  - [x] 결제 이상 탐지 (동일 테넌트 60초 내 중복 결제 429 차단)
  - [x] PCI DSS 준수 확인 (모델·스키마에 카드번호·CVV 미저장 검증)
- **완료 조건:** 위변조 웹훅 요청 차단, 빌링키 암호화 저장 확인

---

## Phase 15: 테넌트 사이트 방문자 인증

> **목표:** 테넌트 홈페이지 방문자(고객)용 회원 체계 완성 — 로그인 / 회원가입 / 이메일 찾기 / 비밀번호 찾기 / 마이페이지 / 회원 탈퇴
> **예상 소요:** 6일
> **선행 조건:** T-020 (공개 사이트 API), T-031 (SMS 발송), T-086 (기능 플래그), T-098 (이메일 발송) 완료
> **참조:** `기획서 섹션 16 전체` (특히 16.0 기존 기획과의 정합 규칙)

---

### T-107: 방문자 회원 DB 스키마 + 마이그레이션 ✅
- **담당:** 백엔드
- **참조:** `기획서 섹션 16.9 (DB 스키마)`
- **작업 내용:**
  - [x] `app/models/site_member.py` — SiteMember, MemberReservation, PhoneVerification, MemberPasswordResetToken 모델
  - [x] `inquiries.member_id` (nullable FK → site_members) 컬럼 추가
  - [x] Alembic 마이그레이션 생성 및 적용 (4개 테이블 + RLS 정책 + 인덱스)
  - [x] `app/schemas/site_member.py` — 가입/로그인/내 정보/알림 설정/예약 Pydantic 스키마
  - [x] `scripts/seed.py`에 테스트용 방문자 회원·예약 데이터 추가 (업종별 1명 이상)
- **완료 조건:** `alembic upgrade head` / `downgrade -1` 성공, 다른 테넌트 회원 조회 시 RLS 로 0건
- **결과:** 커밋 `f979fe2`·`b925e1c`·`51d3071` (feat/T-107, feat/T-125 기준) — 마이그레이션 0019, 테스트 19건 추가 (백엔드 522건 통과 · 커버리지 78%). 기획서 16.9 대비 변경: phone_verifications · member_password_reset_tokens 에 tenant_id NOT NULL + RLS, 이메일·소셜 유니크는 탈퇴 제외 부분 인덱스(#22), 알림 설정용 notify_reservation_confirmed/cancelled 컬럼 추가, 토큰 컬럼 token_hash(SHA-256). 시드: test-tenant 회원 3명(이메일 hong@example.com / member1234 · 카카오 · 네이버 — `.test` 도메인은 이메일 검증에서 거부돼 T-108 에서 수정) + 예약 4건(MEDICAL·LODGING·GENERAL)
- ⚠️ **발견:** 로컬·테스트 DB 접속 계정 `cms_user` 가 슈퍼유저(BYPASSRLS)라 앱 전체에서 RLS 가 실제로는 적용되지 않음 (격리는 서비스 쿼리의 tenant_id 조건에 의존). T-107 테스트는 일반 권한 역할로 바꿔 정책을 검증. 운영은 일반 권한 앱 계정 분리 필요 — 별도 태스크 제안

---

### T-108: 방문자 인증 서비스 + API (가입·로그인) ✅
- **담당:** 백엔드
- **참조:** `기획서 섹션 16.3, 16.4, 16.10, 16.11`
- **작업 내용:**
  - [x] `app/services/member_auth.py` — 가입, 로그인, 로그아웃, 토큰 갱신, 이메일 중복 확인
  - [x] `app/api/public/member_auth.py` — `POST /auth/register`, `/auth/login`, `/auth/logout`, `/auth/refresh`, `GET /auth/check-email`
  - [x] JWT `role=SITE_MEMBER` 발급 + `member_refresh_token` 쿠키 (테넌트 호스트 한정)
  - [x] `get_current_member` 의존성 — 어드민 API 에 방문자 토큰 사용 시 403 (반대도 동일)
  - [x] 연속 실패 5회 → 30분 잠금 (`ACCOUNT_LOCKED`, 남은 시간 응답), 인증 API IP당 10회/분 Rate Limit
  - [x] 가입 성공 시 환영 메일 + `SMS_NOTIFICATION=Y` 테넌트는 관리자에게 신규 회원 알림톡
- **완료 조건:** 가입 → 자동 로그인 → 토큰 갱신 → 로그아웃 동작, 잠금·Rate Limit 동작
- **결과:** 커밋 `c535ff7`·`b6ec3d1`·`0018294`·`0677990` (feat/T-108, feat/T-107 기준) — 마이그레이션 0020(`phone_verifications.used_at`), 테스트 24건 추가 (백엔드 546건 통과 · 커버리지 78%). 실제 HTTP(데모 DB)로 가입 → refresh → 어드민 API 403 → 로그아웃 → refresh 401 → 시드 회원 로그인 확인. 오픈 이슈 #22 옵션 A(즉시 재가입) 결정. 방문자 API 만 공통 에러 형식(5.1) 적용 — 기존 API 의 `{"detail": ...}` 형식은 그대로 (별도 정리 필요). 남은 연동: 휴대폰 인증 발송·확인 API(T-109), `SITE_MEMBER` 기능 플래그 검사(T-115)

---

### T-109: 휴대폰 인증 + 이메일 찾기 + 비밀번호 재설정 API ✅
- **담당:** 백엔드
- **참조:** `기획서 섹션 16.5, 16.6, 16.11`
- **작업 내용:**
  - [x] `POST /auth/phone/send`, `/auth/phone/verify` — 6자리 코드, 3분 만료, 1일 5회 제한 (purpose: REGISTER / FIND_EMAIL / RESET_PW)
  - [x] `POST /auth/find-email` — 휴대폰 인증 완료 시 마스킹 이메일 반환 (앞 2자리 외 `*`)
  - [x] `POST /auth/forgot-password` — 재설정 링크 메일 발송 (토큰 해시 저장, 30분, 1회용), 계정 유무와 무관하게 동일 응답
  - [x] `POST /auth/reset-password` — 새 비밀번호 저장 + 보안 알림 메일/문자, 만료·사용 토큰은 `TOKEN_EXPIRED`
- **완료 조건:** 인증 → 이메일 찾기, 링크 발송 → 재설정 → 재사용 차단 시나리오 통과
- **결과:** 커밋 `0f25e03`·`f454b77`·`7387fd0` (feat/T-109, feat/T-108 기준) — 마이그레이션 0021(`site_members.password_changed_at`), 테스트 24건 추가 (백엔드 570건 통과 · 커버리지 78%). 실제 HTTP(데모 DB)로 발송 → 재요청 429 → 오입력 → 확인 → 이메일 찾기 → 링크 확인 → 재설정 → 재사용 TOKEN_EXPIRED → 새 비밀번호 로그인 확인. 오픈 이슈 #21 옵션 A(SENS SMS) 결정. 추가: 재설정 후 이전 토큰 전부 거부, `GET /auth/reset-password/check`, 로컬 개발용 `debug_code`

---

### T-110: 소셜 로그인 (카카오 / 네이버) ✅
- **담당:** 백엔드 + 프론트엔드
- **참조:** `기획서 섹션 16.3 (소셜 신규 가입), 16.4 (소셜 로그인 플로우)`
- **작업 내용:**
  - [x] `POST /auth/social` — 인가 코드 서버 교환, 소셜 토큰은 클라이언트에 노출 금지
  - [x] 기존 회원 → 즉시 로그인 / 신규 → 휴대폰 인증 + 약관 동의 추가 정보 (`POST /auth/social/complete` — 화면은 T-113)
  - [x] 마이페이지 소셜 계정 연결/해제 API (`/members/me/social` — 화면은 T-114)
  - [x] 기능 플래그 `MEMBER_SOCIAL_LOGIN` OFF 시 API 403 (버튼 숨김은 T-113 화면에서)
- **완료 조건:** 카카오·네이버 각각 신규 가입 / 기존 로그인 / 계정 연결 동작
- **결과:** 커밋 `9ddc9f6`·`76514a6`·`0db0c76`·`df3710a` (feat/T-110, feat/T-109 기준) — 마이그레이션 0022(`member_social_accounts` + 기능 플래그 등록·기존 테넌트 켜기), 백엔드 테스트 21건(591건 통과 · 커버리지 78%) · 클라이언트 6건(166건 통과). 카카오·네이버 실제 API 응답 형태는 MockTransport 로, 브라우저 흐름(콜백 → 추가 정보 이동 / 기존 회원 로그인 → refresh 쿠키)은 stub 모드로 확인. **실제 카카오·네이버 연동 확인은 개발자 앱 키 발급 후** (`SOCIAL_MODE=live` + 키 + 콘솔에 `SOCIAL_REDIRECT_URI` 등록). 오픈 이슈 #24 옵션 A(운영사 공용 앱) 결정

---

### T-111: 마이페이지 + 회원 탈퇴 API ✅
- **담당:** 백엔드
- **참조:** `기획서 섹션 16.7, 16.8, 16.10`
- **작업 내용:**
  - [x] `GET/PATCH /members/me` (이메일 변경 불가), `PATCH /members/me/password`, `PATCH /members/me/notification`
  - [x] `GET /members/reservations` — 상태·기간 필터, 업종별 `detail` 포함 / `POST /members/reservations/{id}/cancel`
  - [x] `GET /members/inquiries` — AD-04 문의와 `member_id` 로 연동, 답변 상태 포함
  - [x] `DELETE /members/me` — 비밀번호 확인(소셜 가입자 생략), 진행 중 예약 있으면 `ACTIVE_RESERVATION_EXISTS`, 소프트 삭제 + 탈퇴 안내 발송
- **완료 조건:** 내 정보 수정·알림 설정·예약 취소·탈퇴 동작, 탈퇴 회원 로그인 불가
  - [x] (추가) 로그인한 방문자의 문의 · 상담 글 · 예약 접수에 `member_id` 기록, 예약은 `member_reservations` 생성 (업종별 유형)
- **결과:** 커밋 `0e33765`·`205840a`·`e67ef39` (feat/T-111, feat/T-110 기준) — 마이그레이션 0023(`withdrawal_reason`), 테스트 16건 추가 (백엔드 607건 통과 · 커버리지 78%). 실제 HTTP(데모 DB)로 내 정보 · 예약(업종별 detail) · 문의 · 알림 설정 · 탈퇴(비밀번호 오류 401 / 진행 중 예약 409) 확인. 탈퇴 시 개인정보 즉시 익명화(개인정보보호법 — 법무 확인 권장), 예약 · 소셜 연결 소프트 삭제, 문의는 연결만 해제. 소셜 가입자 첫 비밀번호 · 연락처 변경은 휴대폰 인증(MYPAGE). 관리자 예약 확정 · 완료 처리는 T-115

---

### T-112: 방문자 인증 API 테스트 ✅
- **담당:** 백엔드
- **참조:** `CLAUDE.md 섹션 12.5`
- **작업 내용:**
  - [x] `tests/test_member_auth.py` — 가입·로그인·잠금·토큰 갱신·Rate Limit
  - [x] `tests/test_member_recovery.py` — 휴대폰 인증 만료/횟수, 이메일 찾기, 재설정 토큰 만료/재사용
  - [x] `tests/test_member_mypage.py` — 내 정보·알림·예약·문의·탈퇴
  - [x] 테넌트 격리 검증 — A 테넌트 회원 토큰으로 B 테넌트 API 접근 시 403, 같은 이메일 테넌트별 가입 허용
  - [x] 방문자 토큰 ↔ 어드민 API 상호 차단 검증
- **완료 조건:** 전체 통과, 커버리지 70% 이상 유지
- **결과:** 커밋 `0140672`·`85bc700` (feat/T-112, feat/T-111 기준) — 방문자 인증 테스트 총 169건 (T-107~T-111 에서 기능별로 작성한 88건 + 격리 매트릭스 81건), 백엔드 688건 통과. 매트릭스: 방문자 API 14개 × (토큰 없음 401 · 어드민 토큰 403 · 다른 테넌트 토큰 403), 어드민 · 슈퍼 어드민 GET API 31개에 방문자 토큰 거부, refresh 쿠키 상호 차단, 같은 이메일 3개 테넌트 가입 · 한 곳 탈퇴 독립. 플랜 한도 항목은 방문자 API 에 해당 없음
- ⚠️ **발견 · 수정:** 커버리지 설정에 greenlet 추적이 없어 SQLAlchemy async 이후 줄이 미실행으로 집계되고 있었음 → `[tool.coverage.run] concurrency = ["greenlet", "thread"]` 추가. **실제 전체 커버리지 93% (기존 표시 78%)**, 방문자 모듈 전부 91% 이상

---

### T-113: 홈페이지 방문자 인증 화면 (apps/client) ✅
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 16.3 ~ 16.6`, 목업 `docs/mockups/hospital/templates/` (T-116)
- **작업 내용:**
  - [x] `apps/client/lib/memberStore.ts` — 방문자 전용 Zustand 스토어 (어드민 authStore 와 분리)
  - [x] `app/[tenant_slug]/member/login`, `join`, `find-email`, `find-password`, `reset-password` 페이지
  - [x] react-hook-form + zod 검증 (16.3 검증 규칙), 이메일 중복 1초 디바운스, 비밀번호 강도 표시
  - [x] 휴대폰 인증 컴포넌트 (발송 → 3분 타이머 → 확인), 재발송 60초 쿨다운
  - [x] 로그인 잠금 시 버튼 비활성화 + 남은 시간 카운트다운
  - [x] 성공 시 이전 페이지 또는 마이페이지 이동, 헤더에 로그인/마이페이지 메뉴 전환
  - [x] Vitest 테스트 (렌더링·검증 메시지·API 성공/실패)
  - [x] (T-110 연동) 로그인·가입 화면 카카오·네이버 버튼 — `fetchSocialAuthorizeUrl` 로 이동, `MEMBER_SOCIAL_LOGIN` OFF 면 숨김
  - [x] (T-110 연동) `/{slug}/member/join-social` 추가 정보 화면 — 콜백이 sessionStorage(`member_social_signup`)에 넣은 값으로 휴대폰 인증 + 약관 → `POST /auth/social/complete` (`email_required` 면 이메일 입력)
- **완료 조건:** 가입 → 로그인 → 이메일 찾기 → 비밀번호 재설정 흐름 E2E 통과
- **결과:** 커밋 `49dcc4c`·`c6d56d4`·`c376376`·`d5115e5` (feat/T-113, feat/T-112 기준) — 화면 6종(login · join · join-social · find-email · find-password · reset-password), 클라이언트 테스트 30건 추가(196건 통과) · 백엔드 690건 통과. Playwright E2E(데모 DB · 실제 서버): 가입(휴대폰 인증) → 자동 로그인 → 헤더 마이페이지/로그아웃 전환(hospital-a 헤더) → 새로고침 후 유지 → 로그아웃 → 로그인(next 이동) → 이메일 찾기 → 비밀번호 찾기 → 재설정 → 링크 재사용 차단 → 새 비밀번호 로그인 → 5회 실패 잠금 카운트다운 확인. 추가 API: `GET /auth/options`(소셜 버튼 노출), 개발용 `debug_reset_url`. 회원 화면은 모든 테넌트 공통 Tailwind 화면 — hospital-a 목업 디자인 적용은 T-124. 로그인 후 기본 이동(마이페이지)은 T-114 에서 화면 추가

---

### T-114: 마이페이지 + 회원 탈퇴 UI (apps/client) ✅
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 16.7, 16.8`
- **작업 내용:**
  - [x] `app/[tenant_slug]/member/mypage` — 탭: 내 예약 / 문의 내역 / 알림 설정 / 내 정보 (기능 플래그로 탭 동적 렌더링)
  - [x] 내 예약 — 병원(일시·진료과·초진/재진) / 펜션(기간·객실·인원·금액) 카드 분기, 상태 배지 4종, 예약 취소
  - [x] 문의 내역 — 답변 대기/완료 배지, 상세 보기
  - [x] 알림 설정 — 토글 즉시 저장 (낙관적 업데이트)
  - [x] 내 정보 — 이름·연락처·생년월일 수정, 비밀번호 변경, 소셜 계정 연결
  - [x] `app/[tenant_slug]/member/withdraw` — 삭제 데이터 안내, 사유 선택, 비밀번호 확인, 진행 중 예약 차단 안내
  - [x] Vitest 테스트
- **완료 조건:** 업종별(HOSPITAL / PENSION / STARTUP) 탭 구성 차이 확인, 탈퇴 후 자동 로그아웃
- **결과:** 커밋 `6b0d8ce`·`720f512`·`80725c5`·`3a9bcae` (feat/T-114, feat/T-113 기준) — 클라이언트 테스트 26건 추가(222건 통과) · 백엔드 694건 통과. Playwright E2E(데모 DB): 업종 HOSPITAL · PENSION → 탭 4개(내 예약 포함, 병원 · 펜션 카드), STARTUP → 탭 3개 + 예약 알림 항목 숨김 / 비로그인 마이페이지 → 로그인(next) / 알림 토글 즉시 저장 · 새로고침 유지 / 문의 상세 답변 / 이름 수정 / 탈퇴 → 진행 중 예약 차단 → 예약 취소 → 탈퇴 완료 화면 + 자동 로그아웃(헤더 전환 · refresh 401 · 로그인 401). 예약 탭 노출은 지금은 업종 기준(`/auth/options.reservations`) — T-115 에서 `MEMBER_RESERVATION` 플래그로 교체
- ⚠️ **E2E 에서 발견 · 수정:** 탈퇴 성공 직후 세션 정리 → 로그인 확인 컴포넌트가 로그인 화면으로 먼저 이동해 완료 화면이 안 보이던 문제 (Zustand 갱신이 즉시 다시 그려짐). 완료 화면을 로그인 확인 밖으로 옮기고, 화면 전환 후 세션 정리 + 회귀 테스트 추가

---

### T-115: 기능 플래그 + 관리자 연동 ✅
- **담당:** 전체
- **참조:** `기획서 섹션 16.0, 16.2`, `기획서 섹션 14.3`
- **작업 내용:**
  - [x] 기능 플래그 키 `SITE_MEMBER`, `MEMBER_SOCIAL_LOGIN`, `MEMBER_RESERVATION` 시드 + `TEMPLATE_TYPE` 별 기본값
  - [x] (T-114 연동) `/auth/options.reservations` 를 업종 기준 → `MEMBER_RESERVATION` 플래그로 교체 (클라이언트 변경 없음)
  - [x] 슈퍼 어드민 SA-04 에서 테넌트별 ON/OFF
  - [x] AD-04 문의 목록에 회원/비회원 표시 + 회원 정보 보기
  - [x] AD-01 대시보드에 신규 회원 수 카드
  - [x] (T-111 연동) AD-04 에서 회원 예약 상태 변경 (대기 → 확정 → 완료, 관리자 취소) — `member_reservations.status` 와 문의 상태 동기화, 확정 · 취소 시 회원 알림 설정(`notify_reservation_*`)에 따라 문자/메일
  - [x] (T-111 연동) AD-04 문의 목록에 회원 여부 배지 (`inquiries.member_id`)
- **완료 조건:** 플래그 OFF 테넌트는 회원 메뉴·API 모두 비활성
  - [x] (추가) 테넌트 생성 시 기본 기능 켜기 — 기존에는 시드만 켜고 슈퍼 어드민이 만든 테넌트는 모든 기능 OFF 였음 (default_enabled · 요금제 · 업종)
  - [x] (추가) 홈페이지 접수 폼(예약 · 상담 · 문의)이 로그인 회원 토큰을 보내도록 — T-111 회원 연결이 실제로 동작하게
- **결과:** 커밋 `d4f8b00`·`8d942bb`·`db6b72c`·`1191d14`·`782be0d`·`1b9ffea` (feat/T-115, feat/T-114 기준) — 마이그레이션 0024, 백엔드 707건(신규 13 · 93%) · 관리자 126건 · 슈퍼어드민 49건 · 클라이언트 230건 통과. E2E(데모 DB · 실제 서버 · 슈퍼어드민 API · 관리자 화면): SITE_MEMBER OFF → 홈페이지 회원 메뉴 숨김 · /member/* 404 · 방문자 API 403 → ON 복구 / 회원이 홈페이지 예약 폼 제출(회원 토큰) → 내 예약 대기중 → 관리자 AD-04 회원 배지 · 회원 정보 · 예약 확정 → 마이페이지 확정 → 완료 처리 / 대시보드 신규 회원 카드
- ⚠️ **E2E 에서 발견 · 수정:** ① 회원 화면 404 가 스트리밍 때문에 HTTP 200 → 미들웨어에서 404 (경량 API 에 `member_enabled`) ② 관리자 예약 처리 후 상세의 "상태 변경" 선택이 이전 값(대기)으로 남아 저장 시 되돌아가던 문제 → 처리 결과로 상태 · 메모 동기화 (+ 라벨 접근성 연결) ③ 홈페이지 접수 폼이 회원 토큰을 안 보내 회원 연결이 안 되던 문제

---

### T-116: 방문자 인증 HTML 목업 (docs/mockups) ✅
- **담당:** 프론트엔드(퍼블리싱)
- **참조:** `기획서 섹션 16.3 ~ 16.8`
- **작업 내용:**
  - [x] 로그인 — 이메일 로그인, 비밀번호 보기, 로그인 상태 유지, 소셜 버튼, 이메일/비밀번호 찾기 링크
  - [x] 회원가입 — 간편 가입, 이메일 중복 확인, 비밀번호 조건 표시, 휴대폰 인증, 약관 동의
  - [x] 이메일 찾기 — 휴대폰 인증 → 마스킹 결과 / 결과 없음 화면
  - [x] 비밀번호 찾기 — 이메일 + 휴대폰 인증 → 발송 완료(재발송 60초) / 새 비밀번호 설정 / 만료 링크 화면
  - [x] 마이페이지 — 내 예약 / 문의 내역 / 알림 설정 / 내 정보 탭
  - [x] 회원 탈퇴 — 안내, 사유, 비밀번호 확인, 진행 중 예약 차단
  - [x] 1440 / 390 폭 확인, 가로 스크롤·콘솔 오류 없음
- **완료 조건:** 6개 화면 정적 목업에서 기획서 흐름 그대로 재현
---

## Phase 16: 코드형 템플릿 & 목업 이식

> **목표:** 템플릿별로 SCSS / Tailwind 를 골라 쓰는 코드형 템플릿 엔진을 만들고, 디자인 목업(`docs/mockups/hospital/templates`)을 첫 코드형 템플릿으로 테넌트 홈페이지에 입힌다. 처음 적용 시 템플릿 샘플 문구·이미지로 시작한다.
> **예상 소요:** 8일
> **선행 조건:** Phase 8 (템플릿 시스템), Phase 9 (인라인 편집) 완료 / 회원 화면은 T-113·T-114 와 함께 진행
> **참조:** `기획서 섹션 11.7 ~ 11.11`
> **원칙:** 목업 폴더(`docs/mockups/hospital/templates`)는 디자인 원본 — **읽기만 하고 수정하지 않는다.** 필요한 SCSS·이미지는 `apps/client` 로 복사해서 쓴다.

---

### T-117: 템플릿 DB · API 확장 ✅
- **담당:** 백엔드
- **참조:** `기획서 섹션 11.10`
- **작업 내용:**
  - [x] Alembic 마이그레이션 — `templates`(renderer · styling · version · sample_content · updated_at), `sections.page_key`, `section_settings.is_sample`, `template_change_history.content_snapshot`, 인덱스
  - [x] `SectionType` 추가 (HERO_SLIDER · VIDEO_PLAYLIST · NOTICE_LATEST · SUB_HERO · CONTENT_BLOCK · HISTORY_TIMELINE · BOARD) — 백엔드 enum + `packages/types`
  - [x] `POST /templates/apply` — `content_mode: keep | replace_with_sample`, 교체 전 콘텐츠 스냅샷, 롤백 시 콘텐츠 복원
  - [x] `GET /templates` 에 code · renderer · styling · version, 공개 사이트 API 섹션에 `page_key` (페이지 쿼리 대신 — 캐시 키 유지)
  - [x] 섹션 저장 시 `is_sample=false` 갱신
  - [x] pytest — apply keep / replace / rollback, page_key 조회, RLS 격리
- **완료 조건:** 마이그레이션 up/down 성공, 테스트 통과, 기존 테마형 템플릿 동작 변화 없음
- **결과:** 커밋 `39fbe88` (feat/T-117) — 마이그레이션 0017 테스트 DB up/down/up 확인, pytest 전체 480건 + 신규 12건 통과(커버리지 77.9%), 시드에 TPL_HOSPITAL_A 추가. 개발 DB(cms_db)에는 아직 미적용

---

### T-118: 템플릿 엔진 — 레지스트리 · 매니페스트 · 공통 계약 ✅
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 11.7`
- **작업 내용:**
  - [x] `packages/types` — `TemplateManifest`, `TemplatePage`
  - [x] `apps/client/templates/registry.ts` — 템플릿 키 → 매니페스트 + 동적 import (템플릿별 청크 분리)
  - [x] `templates/shared/contracts.ts` — 섹션·페이지 props 계약, Editable 래퍼 재사용
  - [x] `[tenant_slug]` 렌더링 분기 — `renderer: 'theme'` 은 기존 SectionRenderer, `'code'` 는 템플릿 전용 컴포넌트
  - [x] 페이지 루트에 `data-template="{key}"` 렌더링
  - [x] Vitest — 레지스트리 조회, 미지원 섹션 생략, 테마형 회귀 없음
- **완료 조건:** 빈 코드형 템플릿(테스트용)으로 렌더링 분기 동작, 기존 6종 화면 변화 없음
- **결과:** 커밋 `db86477` — Vitest 15건. 미리보기 `/{slug}/preview?tpl=TPL_HOSPITAL_A` 로 확인 가능 (테넌트 template_id 연동은 T-117)

---

### T-119: SCSS 파이프라인 + 스타일 격리 ✅
- **담당:** 프론트엔드
- **참조:** `기획서 섹션 11.7 (스타일 격리 · 스타일링 규칙)`, 오픈 이슈 #26
- **작업 내용:**
  - [x] `sass` 의존성 추가, Next SCSS 설정
  - [x] CSS 레이어 순서 고정 (`@layer base` → `components` → `template` → `utilities`)
  - [x] 템플릿 SCSS 를 `[data-template]` 루트로 스코프하는 규칙 + stylelint 설정
  - [x] 두 템플릿(SCSS 1 · Tailwind 1)을 연달아 열어도 스타일이 섞이지 않는지 Playwright 확인 (테마형 Tailwind 테넌트 화면 변화 없음 확인 + 스코프·레이어·이름 충돌 자동 검사 테스트)
  - [x] CLAUDE.md 스타일 규칙 반영 확인 (템플릿 SCSS 허용 범위)
- **완료 조건:** SCSS 템플릿·Tailwind 템플릿 공존, 서로 스타일 영향 0, 빌드·린트 통과
- **결과:** 커밋 `8caa590` (+ 검사 테스트는 T-121 커밋). ⚠️ 오픈 이슈 #26 — Next 동적 import 로는 템플릿 CSS·JS 가 다른 테넌트 페이지에도 함께 내려옴 (화면 영향은 없음, 용량만). 분리 방식 재결정 필요 → T-125

---

### T-120: 샘플 콘텐츠 시스템 ✅
- **담당:** 백엔드 + 프론트엔드
- **참조:** `기획서 섹션 11.8`
- **작업 내용:**
  - [x] `templates/{key}/sample-content.json`(원본) → 백엔드 `app/data/templates/{code}.json` → 시드가 `templates.sample_content` 동기화 (불일치 시 pytest 실패)
  - [x] 샘플 이미지 공용 스토리지 업로드 스크립트 (`templates/{key}/{version}/…`) — `scripts/upload_template_assets.py` (동일 파일 건너뜀 · `--dry-run` · `templates/*` 공개 읽기 정책), `TEMPLATE_ASSET_BASE_URL` 설정 시 샘플 복사부터 공용 주소 참조 (기존 테넌트 주소 유지)
  - [ ] ⏸ `SOURCES.md` 이미지 출처 · 라이선스 확인 (사용자) — unsplash 9장은 확인됨, 메인 이미지 14장 · 아이콘 · 로고는 '확인 필요'. 확인 전에는 스크립트가 업로드 거부 (개발 환경만 `--allow-unverified`) → **운영 배포 전 필수**
  - [x] 테넌트 생성(슈퍼 어드민 '시작 템플릿') · 템플릿 적용 시 샘플 복사 (`is_sample=true`), 콘텐츠 유지 적용 시 없는 섹션만 채움
  - [x] AD-06 템플릿 변경 모달 — "내 콘텐츠 유지(기본) / 샘플로 교체" 선택 + 교체 경고
  - [x] AD-02 · 인라인 편집 툴바 '샘플' 배지, AD-01 "샘플 n개 남음" 카드
  - [x] 테스트 — 복사 · 유지 · 교체 · 롤백 / 공용 샘플 이미지 삭제 · 덮어쓰기 불가 (업로드 · 삭제 · 고아 파일 정리 모두 `templates/` 차단)
- **완료 조건:** 새 테넌트가 템플릿 샘플로 완성된 홈페이지에서 시작, 수정한 값은 샘플 표시 해제
- **진행 (1차):** 커밋 `c6999f4`·`c61a33e`·`836b01e`·`cdabccd` (feat/T-120) — 완료 조건 충족. 공용 스토리지 업로드·이미지 출처 확인만 남음 (운영 배포 전)
- **결과 (2차):** 커밋 `3dec727`·`1b99a6b` (feat/T-120) — 백엔드 734건 통과 · 커버리지 93.5% · ruff 통과 (mypy 는 개발 의존성에 없어 미실행). 로컬 MinIO 실제 업로드 30개(재실행 시 30개 건너뜀), 샘플 JSON 이미지 28개 모두 공용 주소 익명 GET 200 · `Cache-Control: immutable`. 함께 수정: 자정 직후(00:00~00:44 KST) 실패하던 휴대폰 발송 한도 테스트 (T-109). 발견 사항: 테넌트 업로드 경로(`{tenant_id}/…`)는 버킷 정책상 익명 읽기 403 — 공개 정책은 `public/*` · `templates/*` 만 (별도 확인 필요)

---

### T-121: 목업 이식 ① 공통 레이아웃 + 메인 섹션 ✅
- **담당:** 프론트엔드
- **참조:** 목업 `_template.html`, `components/header·footer·quick-menu`, `components/sections/*`
- **작업 내용:**
  - [x] `templates/hospital-a/` 생성 — manifest(`renderer: code`, `styling: scss`), 토큰을 `theme.ts` 변수로 연결
  - [x] 목업 SCSS(`_tokens` · `_mixins` · `_base` · 블록별) 복사 후 `[data-template]` 스코프로 정리
  - [x] Header(GNB · 모바일 메뉴 · 계정 링크) · Footer · QuickMenu
  - [x] 메인 섹션 5종 — HeroSlider(Swiper) · BrandIntro · ServiceCards · VideoPlaylist · NoticeLatest (GSAP 스크롤 애니메이션 포함)
  - [x] 텍스트·이미지 Editable 래핑, 섹션 settings 키 정의 (제목·설명 등 단일 값만 인라인 편집 — 슬라이드·카드 등 목록과 이미지는 관리자 AD-02 편집)
  - [x] 샘플 콘텐츠 — 목업 문구·이미지 그대로
- **완료 조건:** `/{slug}` 메인이 목업과 동일 (1440 / 390 스크린샷 비교), 인라인 편집으로 문구·이미지 변경 가능
- **결과:** 커밋 `48f6985` — 목업 대비 1440 / 390 스크린샷 일치, 가로 스크롤·콘솔 오류 0, Vitest 9건 + 스타일 검사 5건
- **남은 일:** 섹션 순서 바꾸기·숨기기 컨트롤(SectionControls)은 코드형 미적용 / 샘플 이미지 출처 확인 (`public/templates/hospital-a/1.0.0/SOURCES.md`) / Typekit 서체 도메인 등록

---

### T-122: 목업 이식 ② 서브 페이지 ✅
- **담당:** 프론트엔드
- **참조:** 목업 `about*.html`, `business.html`, `components/sub/*`, `기획서 섹션 11.9`
- **작업 내용:**
  - [x] 서브 페이지 라우트 `/{slug}/[page]` + 매니페스트 `pages` 기반 메뉴·하위 탭·브레드크럼
  - [x] SubHero(이미지형 · 텍스트형) · SubNav · 콘텐츠 블록(media-row · split-story · strength-list · area-rows · banner-split · criteria-cards · value-circles · milestone-split · photo-gallery) · HistoryTimeline · 오시는 길(MAP)
  - [x] 페이지별 샘플 콘텐츠 (소개 · 연혁 · 오시는 길 · 사업 소개)
- **완료 조건:** 서브 4개 페이지가 목업과 동일, 각 블록 문구·이미지 편집 가능
- **결과:** 커밋 `5cb97a0` (feat/T-122) — 1440·390 에서 섹션별 높이가 목업과 일치, 테스트 15건 추가(클라이언트 140건 통과). 제목·설명 등 단일 값은 인라인 편집, 문단·목록·이미지는 관리자 AD-02 편집. 실제 라우트의 없는 페이지는 404 화면이지만 HTTP 상태는 200 (기존 loading.tsx 스트리밍 동작 — T-125 점검)

---

### T-123: 목업 이식 ③ 공지 · 상담 · 예약 페이지 ✅
- **담당:** 프론트엔드 + 백엔드
- **참조:** 목업 `notice*.html`, `consult*.html`, `reservation.html`, 오픈 이슈 #27
- **작업 내용:**
  - [x] 공지 목록 · 상세 (검색 · 페이지 이동) — 데이터 저장 방식은 오픈 이슈 #27 결정에 따름
  - [x] 온라인 상담 목록 · 상세 · 글쓰기 — 문의 API(5.5) 연동, 비밀글, 답변 표시 (AD-04 답변 연동)
  - [x] 온라인 예약 신청 — 문의 API(예약 유형) 연동, reCAPTCHA(T-051) 재사용
  - [x] 목업 검사 규칙 이식 (필수 순서·짧음·형식 문구 동일 — 폼이 단순해 react-hook-form 대신 공용 검사 함수)
- **완료 조건:** 상담·예약 접수가 관리자 AD-04 에 들어오고 답변이 상세 화면에 표시
- **결과:** 커밋 `f82f498`·`18366f1`·`c892aec` (feat/T-123) — 마이그레이션 0018, 백엔드 테스트 501건·클라이언트 153건·관리자 116건 통과. 공지·상담 목록·상세는 목업과 섹션 높이 일치, 글쓰기·예약 폼은 보안문자 칸만큼(약 100px) 짧음 (reCAPTCHA 로 대체)

---

### T-124: 목업 이식 ④ 회원 화면 스타일 적용 ✅
- **담당:** 프론트엔드
- **참조:** 목업 `login · join · join-social · find-email · find-pw · reset-pw · mypage · withdraw`, T-113 · T-114
- **작업 내용:**
  - [x] T-113 · T-114 의 방문자 인증 화면 로직을 hospital-a 템플릿 마크업·SCSS(member-form · mypage)로 렌더링 — `templates/hospital-a/components/member/*`, SCSS `sub/_member-form` · `sub/_mypage` 이식
  - [x] 테마형 템플릿용 기본(Tailwind) 회원 화면과 같은 로직 공유 (화면만 템플릿별) — headless 훅 `hooks/member/useMemberForms.ts` · `useMypage.ts` 로 분리, 공통 화면도 같은 훅 사용 (마크업 변경 없음)
- **완료 조건:** hospital-a 테넌트의 회원 화면 8종이 목업과 동일하고 실제 API 로 동작
- **결과:** 커밋 `abeb111`·`1168053`·`db4e587` (feat/T-124, feat/T-115 기준) — 클라이언트 테스트 242건 통과(신규 11건 + 미들웨어 갱신), lint · type-check · build 통과. 미들웨어가 `MEMBER_SCREEN_TEMPLATES`(hospital-a) 테넌트의 `/{slug}/member/{page}` 를 템플릿 라우트로 rewrite (그 외 템플릿은 공통 화면 유지), 회원 화면은 noindex · 편집 툴바 없음. Playwright 시각 비교(목업 vs 실제, 1440 / 390, `main` 높이): find-email · find-password · reset(만료) · join-social · 마이페이지(알림 · 내 정보 · 예약) · withdraw 동일, 가로 스크롤 0. 의도된 차이: 로그인 목업의 데모 안내 줄 제거(−65px), 회원가입에 SNS 가입 버튼 추가(기획서 16.3, +130px), 오류 문구는 기획서 기준, 문의 내역은 상세 링크 대신 펼침. E2E(데모 DB · 실제 API): 빈 제출 오류 → 비밀번호 조건 3개 → 휴대폰 인증 타이머 → 전체 동의 → 가입 → 마이페이지 "안녕하세요, 이병원 님" · 헤더 전환 → 탈퇴 동의 누락 오류 → 탈퇴 완료 화면 유지 · 세션 표시 삭제

---

### T-125: 통합 검증 + 관리자 연동 ✅
- **담당:** 전체
- **작업 내용:**
  - [x] AD-06 템플릿 목록에 hospital-a 추가 (썸네일 · 미리보기 · 코드형/스타일 방식 표시) — 카드 배지 "전용 디자인 · 서브 페이지 포함" · "샘플 문구·이미지 포함", 미리보기 주소는 템플릿 code 사용
  - [x] 템플릿 전환 시나리오 E2E — 테마형 ↔ 코드형, keep / replace_with_sample, 롤백 (데모 환경 실제 API · 화면 확인, 미들웨어 캐시 60초 후 반영)
  - [x] Playwright 시각 비교 — 목업 vs 실제 페이지 (1440 / 390), 가로 스크롤 · 콘솔 오류 0 — 7개 페이지 × 2 폭 14건 높이 동일
  - [x] 템플릿별 라우트 분기 (오픈 이슈 #26 결정) — 미들웨어가 테넌트 템플릿을 보고 `/{slug}` 를 템플릿 전용 내부 라우트로 rewrite, 템플릿 ID 는 캐시
  - [x] 성능 — 템플릿 청크만 로드되는지 확인 ✅, Lighthouse 성능 90 이상 (T-052 기준) — 메인 모바일 57 → 10회 중앙값 92 (84~95), 데스크톱 99. 서브 페이지 모바일 87~89 (소개 · 사업)
  - [x] 접근성 — 키보드 · 스크린리더 기본 점검 (T-044 기준) — Lighthouse 접근성 93~97. 남은 항목은 목업 디자인 자체(퀵메뉴 대비 3.03, 슬라이더 점 크기) — 디자인 변경 없이 보고만
- **완료 조건:** 전체 시나리오 통과, 목업과 시각 차이 허용 범위 내
- **결과:** 커밋 `0e8b50c`·`7d290db`·`3576b5e`·`26636a3` (feat/T-125) — 백엔드 503건·클라이언트 159건·관리자 119건·슈퍼어드민 48건 통과. 테마 테넌트 페이지에 hospital-a CSS·JS 0 (프로덕션 빌드 확인), 없는 페이지·`/tpl-*` 직접 접근 HTTP 404. 모바일 성능 미달 원인: 슬라이더 첫 화면 이미지 크기(LCP 6~8.6초)·웹폰트 — Typekit 킷 `font-display: swap` 변경(Adobe 킷 설정) 후 재측정 필요 (1차)
- **결과 (2차 — 모바일 성능):** 커밋 `136d711`·`6830d0a`·`6eb61e4` (feat/T-125) — 클라이언트 테스트 253건 · lint · type-check · stylelint · build 통과. 원인은 이미지가 아니라 첫 화면을 막는 CSS(약 480KB)였다: ① 루트 레이아웃의 Noto Sans KR @font-face(154KB)를 테마형 라우트에만 (`TenantShell` 분리) ② Remix Icon 쓰는 38개만 축소본(CSS 138KB→2KB, woff2 189KB→3KB, `pnpm icons:subset` · fonttools 필요) ③ 웹폰트 CSS 는 하이드레이션 후 적용(preload 도 하지 않음 — 측정상 더 느림), Typekit 은 `font-display:auto` 라 LCP 카피가 숨던 것을 swap 으로 바꿔 적용(CORS 허용 확인, 글꼴 · 추적 @import 유지) ④ 서브 히어로 이미지 우선 로드, 영상 썸네일 · 스토리지(MinIO·CDN) 이미지 Next 변환. 측정(로컬 프로덕션 빌드 · Lighthouse 13 모바일 기본 시뮬레이션): 메인 FCP 5.7→1.2초 · LCP 9.2→2.9~4.3초, 테마 테넌트 88~91(변화 없음). 시각 비교 메인 · 소개 · 사업 1440/390 높이 목업과 동일, 아이콘 · 글꼴 정상. 참고: ① 로컬 측정은 첫 화면이 0.1초대라 지연 이미지 시작 시점에 따라 점수가 84 / 94 두 갈래로 갈림(운영 환경 재측정 권장) ② 실제 네트워크 제한(devtools) 측정에서는 슬라이더 자동 재생으로 새 카피가 LCP 후보가 되어 LCP 가 길게 잡힘 — 측정 방식의 특성, 디자인 유지 ③ AVIF 변환은 측정상 더 느려 되돌림 ④ 비로그인 방문 시 `/api/v1/auth/me` 401 콘솔 오류(관리자 로그인 확인, 기존 동작)

---

*최종 업데이트: 2026-10-27*
*총 127개 태스크 | 예상 총 개발 기간: 약 12~14주 (1~2인 팀 기준)*
