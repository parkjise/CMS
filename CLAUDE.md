# CLAUDE.md
# 멀티 테넌트 CMS 관리자 시스템 — Claude 개발 가이드

---

## ⚠️ 이 파일은 선택이 아닌 필수 (MANDATORY READ)

**모든 작업 시작 전에 이 파일 전체를 반드시 읽어야 한다.**
읽지 않고 코드를 작성하는 것은 허용되지 않는다.
아래 규칙을 하나라도 건너뛰면 해당 작업은 무효다.

```
작업 시작 전 체크리스트 (순서 엄수)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[ ] 1. 이 파일(CLAUDE.md) 전체 읽기
[ ] 2. TASK.md에서 오늘 작업할 태스크 확인
[ ] 3. 문서 버전 확인 (아래 섹션 0 참조)
[ ] 4. 작업 플랜 작성 및 승인
[ ] 5. worktree 브랜치 생성
[ ] 6. 코드 작성
[ ] 7. 테스트 작성 및 통과
[ ] 8. 검증 실행 및 통과
[ ] 9. 커밋 (형식 엄수)
[ ] 10. TASK.md 완료 체크
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 0. 문서 버전 관리 (자동 동기화)

**현재 문서 버전:** `v1.4`
**연동 기획서:** `docs/CMS_Admin_Specification_v1.4.md`

### 문서 버전 확인 규칙

작업 시작 시 반드시 아래를 확인한다.

```bash
# 현재 기획서 버전 확인
ls docs/CMS_Admin_Specification_*.md | sort -V | tail -1

# CLAUDE.md의 버전과 일치하는지 확인
# 불일치 시 → 최신 기획서 버전으로 CLAUDE.md 상단 버전 업데이트 후 작업 시작
```

### 문서 버전 업데이트 시 자동 처리 규칙

기획서 버전이 올라갈 때마다 Claude는 반드시:

1. CLAUDE.md 상단 `현재 문서 버전` 숫자 업데이트
2. CLAUDE.md 상단 `연동 기획서` 파일명 업데이트
3. `14. 자주 참조하는 파일 위치` 테이블의 기획서 경로 업데이트
4. 변경된 섹션이 있으면 관련 개발 규칙 동기화
5. 버전 업데이트 자체를 커밋: `docs: 기획서 v1.X 반영하여 CLAUDE.md 버전 동기화`

```
기획서 v1.3 → v1.4 업데이트 예시:
  CLAUDE.md 상단: v1.3 → v1.4
  기획서 경로: ...v1.3.md → ...v1.4.md
  커밋: docs(claude): 기획서 v1.4 반영 CLAUDE.md 동기화
```

---

## 1. 프로젝트 한 줄 요약

소상공인(병원·펜션·스타트업)을 위한 **멀티 테넌트 노코드 CMS SaaS**.
하나의 코드베이스로 N개 사업체의 홈페이지를 운영하며,
고객이 코드 없이 템플릿 선택·인라인 편집·AI 어시스턴트로 홈페이지를 직접 관리한다.

---

## 2. 모노레포 디렉토리 구조 (전체)

```
cms-project/                          ← 프로젝트 루트 (여기서 모든 명령 실행)
├── CLAUDE.md                         ← 이 파일 (Claude 가이드)
├── TASK.md                           ← 전체 개발 태스크 체크리스트
├── docs/
│   └── CMS_Admin_Specification_v1.4.md  ← 상세 기획서
├── docker-compose.yml                ← 로컬 인프라 (PostgreSQL, Redis, MinIO)
├── docker-compose.prod.yml           ← 프로덕션 인프라
├── pnpm-workspace.yaml               ← pnpm 모노레포 설정
├── package.json                      ← 루트 패키지 (공통 스크립트)
├── .env.example                      ← 환경변수 템플릿
│
├── apps/
│   ├── superadmin/                   ← 슈퍼 어드민 (운영사 전용, React 19 + Vite 7)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── tenants/          ← 테넌트 관리
│   │   │   │   ├── features/         ← 기능 배포 관리
│   │   │   │   ├── monitoring/       ← 모니터링
│   │   │   │   ├── revenue/          ← 수익 관리
│   │   │   │   └── announcements/    ← 공지 관리
│   │   │   ├── pages/
│   │   │   └── stores/
│   │   ├── vite.config.ts
│   │   └── package.json              ← :3002 포트
│   │
│   ├── admin/                        ← 테넌트 관리자 페이지 (React 19 + Vite 7)
│   │   ├── src/
│   │   │   ├── components/           ← 어드민 전용 컴포넌트
│   │   │   │   ├── ui/               ← 기본 UI (packages/ui 사용)
│   │   │   │   ├── dashboard/        ← AD-01 대시보드 컴포넌트
│   │   │   │   ├── content/          ← AD-02 섹션 편집기
│   │   │   │   ├── sns/              ← AD-03 SNS 설정
│   │   │   │   ├── inquiries/        ← AD-04 문의 관리
│   │   │   │   ├── seo/              ← AD-05 SEO 설정
│   │   │   │   └── templates/        ← AD-06 템플릿 선택기
│   │   │   ├── pages/                ← 페이지 컴포넌트 (라우터 단위)
│   │   │   ├── stores/               ← Zustand 스토어
│   │   │   ├── hooks/                ← 커스텀 훅
│   │   │   ├── lib/                  ← API 클라이언트, 유틸
│   │   │   │   ├── api.ts            ← axios 인스턴스 + 인터셉터
│   │   │   │   └── queryClient.ts    ← TanStack Query 설정
│   │   │   ├── router.tsx            ← React Router 라우팅 설정
│   │   │   └── main.tsx              ← 앱 진입점
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   └── package.json
│   │
│   ├── client/                       ← 고객 홈페이지 (Next.js 15)
│   │   ├── app/
│   │   │   ├── [tenant_slug]/        ← 테넌트별 동적 라우트
│   │   │   │   ├── page.tsx          ← 홈페이지 메인
│   │   │   │   └── layout.tsx        ← SEO 메타 주입
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── sections/             ← 섹션 컴포넌트 (HeroBanner, Intro 등)
│   │   │   ├── edit/                 ← AD-07 인라인 편집 모드 컴포넌트
│   │   │   │   ├── EditToolbar.tsx   ← 상단 편집 툴바
│   │   │   │   ├── EditableText.tsx  ← 인라인 텍스트 편집
│   │   │   │   ├── EditableImage.tsx ← 이미지 클릭 업로드
│   │   │   │   └── SectionControls.tsx ← 섹션 이동/숨기기
│   │   │   └── ai/                   ← AI 어시스턴트 패널
│   │   ├── lib/
│   │   │   ├── api.ts                ← Public API 클라이언트
│   │   │   └── editStore.ts          ← 편집 모드 Zustand 스토어
│   │   ├── next.config.ts
│   │   ├── tailwind.config.ts
│   │   └── package.json
│   │
│   └── backend/                      ← FastAPI 백엔드 (Python 3.13)
│       ├── app/
│       │   ├── main.py               ← FastAPI 앱 진입점, 라우터 등록
│       │   ├── core/
│       │   │   ├── config.py         ← 환경변수 로드 (pydantic-settings)
│       │   │   ├── security.py       ← JWT 생성/검증
│       │   │   ├── deps.py           ← FastAPI 의존성 (get_db, get_current_user)
│       │   │   └── redis.py          ← Redis 연결
│       │   ├── db/
│       │   │   ├── session.py        ← SQLAlchemy 세션, RLS 미들웨어
│       │   │   └── base.py           ← Base 모델 선언
│       │   ├── models/               ← SQLAlchemy ORM 모델
│       │   │   ├── tenant.py
│       │   │   ├── user.py
│       │   │   ├── section.py
│       │   │   ├── inquiry.py
│       │   │   ├── template.py
│       │   │   └── ...
│       │   ├── schemas/              ← Pydantic 요청/응답 스키마
│       │   │   ├── auth.py
│       │   │   ├── section.py
│       │   │   ├── inquiry.py
│       │   │   └── ...
│       │   ├── api/
│       │   │   └── v1/
│       │   │       ├── router.py     ← 전체 라우터 통합
│       │   │       └── endpoints/
│       │   │           ├── auth.py
│       │   │           ├── sections.py
│       │   │           ├── inquiries.py
│       │   │           ├── upload.py
│       │   │           ├── sns.py
│       │   │           ├── seo.py
│       │   │           ├── templates.py
│       │   │           ├── notifications.py  ← SSE 엔드포인트
│       │   │           └── ai.py
│       │   ├── services/             ← 비즈니스 로직 레이어
│       │   │   ├── auth.py
│       │   │   ├── section.py
│       │   │   ├── inquiry.py
│       │   │   ├── image.py          ← Pillow 이미지 최적화
│       │   │   ├── notification.py   ← 알림톡/SMS 발송
│       │   │   └── ai.py             ← LangChain AI 서비스
│       │   └── workers/              ← Celery 비동기 태스크
│       │       ├── celery_app.py     ← Celery 앱 설정
│       │       ├── notification.py   ← 알림 발송 태스크
│       │       └── image.py          ← 이미지 처리 태스크
│       ├── alembic/                  ← DB 마이그레이션
│       │   ├── versions/
│       │   └── env.py
│       ├── tests/                    ← pytest 테스트
│       │   ├── conftest.py
│       │   ├── test_auth.py
│       │   ├── test_sections.py
│       │   └── test_inquiries.py
│       ├── pyproject.toml            ← Poetry 의존성
│       ├── alembic.ini
│       └── Dockerfile
│
└── packages/
    ├── ui/                           ← 공통 React 컴포넌트
    │   ├── src/
    │   │   ├── Button.tsx
    │   │   ├── Modal.tsx
    │   │   ├── Input.tsx
    │   │   ├── Toggle.tsx
    │   │   ├── Toast.tsx
    │   │   └── index.ts              ← 전체 export
    │   └── package.json
    └── types/                        ← 공통 TypeScript 타입
        ├── src/
        │   ├── api.ts                ← API 공통 응답 타입
        │   ├── section.ts            ← 섹션 관련 타입
        │   ├── inquiry.ts
        │   ├── template.ts
        │   └── index.ts
        └── package.json
```

---

## 3. 기술 스택 (버전 고정)

### 프론트엔드

| 역할 | 패키지 | 버전 |
|---|---|---|
| UI 프레임워크 (관리자) | react | 19.x |
| 빌드 툴 (관리자) | vite | 7.x |
| UI 프레임워크 (홈페이지) | next | 15.x |
| 언어 | typescript | 5.9.x |
| CSS | tailwindcss | 4.x |
| 서버 상태 관리 | @tanstack/react-query | 5.x |
| 클라이언트 상태 | zustand | 5.x |
| 드래그앤드롭 | @dnd-kit/react | 0.4.x |
| HTTP 클라이언트 | axios | 1.x |
| 폼 관리 | react-hook-form | 7.x |
| 유효성 검사 | zod | 3.x |
| 날짜 처리 | dayjs | 1.x |
| 차트 | recharts | 2.x |
| 아이콘 | lucide-react | 최신 |
| 토스트 알림 | sonner | 1.x |

### 백엔드

| 역할 | 패키지 | 버전 |
|---|---|---|
| 웹 프레임워크 | fastapi | 0.115.x |
| 데이터 검증 | pydantic | 2.x |
| ORM | sqlalchemy | 2.x |
| DB 마이그레이션 | alembic | 1.x |
| 비동기 드라이버 | asyncpg | 0.29.x |
| 비밀번호 해싱 | bcrypt | 4.x |
| JWT | python-jose | 3.x |
| 이미지 처리 | Pillow | 11.x |
| 작업 큐 | celery | 5.x |
| Redis 클라이언트 | redis | 5.x |
| S3/MinIO | boto3 | 1.x |
| HTTP 클라이언트 | httpx | 0.27.x |
| AI | langchain-openai | 최신 |
| ASGI 서버 | uvicorn[standard] | 최신 |
| 환경변수 | pydantic-settings | 2.x |
| 테스트 | pytest-asyncio | 최신 |

### 인프라

| 역할 | 기술 | 버전 |
|---|---|---|
| 데이터베이스 | PostgreSQL | 17 |
| 캐시/큐/PubSub | Redis | 8.x |
| 오브젝트 스토리지 | MinIO | 최신 |
| 컨테이너 | Docker + Compose | 최신 |
| 리버스 프록시 | Nginx | 1.28 |

---

## 4. 코딩 컨벤션 (반드시 준수)

### Python (백엔드)

```python
# ✅ 올바른 패턴
# 1. 모든 엔드포인트는 async def
# 2. 비즈니스 로직은 반드시 services/ 레이어로 분리
# 3. 모든 DB 쿼리는 services/ 에서만 실행 (엔드포인트에서 직접 DB 쿼리 금지)
# 4. 응답은 반드시 Pydantic 스키마로 직렬화
# 5. 에러는 HTTPException으로 처리

# 엔드포인트 예시
@router.get("/{section_id}", response_model=SectionResponse)
async def get_section(
    section_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),         # RLS 자동 적용
    current_user: User = Depends(get_current_user),
):
    section = await section_service.get_by_id(db, section_id)
    if not section:
        raise HTTPException(status_code=404, detail="섹션을 찾을 수 없습니다.")
    return section

# ❌ 금지 패턴
# - 엔드포인트에서 직접 db.execute() 호출
# - def (동기 함수) 사용 (I/O 작업 시)
# - 하드코딩된 문자열 에러 메시지 (상수 파일로 분리)
```

```python
# 파일 네이밍: snake_case
# 클래스 네이밍: PascalCase
# 상수: UPPER_SNAKE_CASE
# 코드 포맷터: Black (line-length=88)
# 린터: Ruff
# 타입 힌트: 모든 함수 파라미터·반환값에 필수
```

### TypeScript (프론트엔드)

```typescript
// ✅ 올바른 패턴
// 1. 컴포넌트: 함수형 + 화살표 함수
// 2. Props 타입: interface 사용 (type 대신)
// 3. API 호출: TanStack Query 훅으로만 (useQuery, useMutation)
// 4. 전역 상태: Zustand 스토어 (useState 남용 금지)
// 5. 공통 타입: packages/types에서 import

// 컴포넌트 예시
interface SectionCardProps {
  section: Section        // packages/types에서 import
  onToggle: (id: string) => void
}

const SectionCard = ({ section, onToggle }: SectionCardProps) => {
  return <div>...</div>
}

export default SectionCard

// ❌ 금지 패턴
// - any 타입 사용
// - 컴포넌트 내부에서 직접 fetch/axios 호출
// - CSS 인라인 스타일 (Tailwind 클래스 사용)
// - console.log 커밋 (개발 중 사용 후 반드시 제거)
```

```
파일 네이밍:
  컴포넌트: PascalCase (SectionCard.tsx)
  훅: camelCase (useSections.ts)
  유틸/서비스: camelCase (apiClient.ts)
  스토어: camelCase (editStore.ts)
  타입: camelCase (section.ts)

포맷터: Prettier
린터: ESLint (Airbnb 규칙 기반)
```

---

## 5. API 공통 규격 (반드시 준수)

### 요청/응답 형식

```python
# 모든 성공 응답
{
  "success": True,
  "data": { ... },
  "meta": {
    "timestamp": "2026-05-24T14:23:00Z",
    "version": "1.0"
  }
}

# 모든 에러 응답
{
  "success": False,
  "error": {
    "code": "에러코드",       # VALIDATION_ERROR, NOT_FOUND 등
    "message": "사용자 노출 메시지 (한국어)",
    "field": "문제 필드명",   # 검증 에러 시
    "details": []
  }
}
```

### 에러 코드 표준

| HTTP | code | 사용 상황 |
|---|---|---|
| 400 | VALIDATION_ERROR | 입력값 검증 실패 |
| 401 | UNAUTHORIZED | 인증 토큰 없음/만료 |
| 403 | FORBIDDEN | 권한 없음 (타 테넌트 접근) |
| 404 | NOT_FOUND | 리소스 없음 |
| 409 | CONFLICT | 중복 데이터 |
| 413 | FILE_TOO_LARGE | 파일 20MB 초과 |
| 422 | PLAN_LIMIT_EXCEEDED | 요금제 한도 초과 |
| 429 | RATE_LIMIT_EXCEEDED | API 호출 한도 초과 |
| 500 | INTERNAL_ERROR | 서버 내부 오류 |

### API URL 구조

```
# 슈퍼 어드민 API (SUPER_ADMIN role 전용)
/api/super/v1/tenants/...
/api/super/v1/features/...
/api/super/v1/dashboard/...
/api/super/v1/monitoring/...
/api/super/v1/announcements/...

# 테넌트 어드민 API (인증 필요)
/api/v1/auth/...
/api/v1/sections/...
/api/v1/inquiries/...
/api/v1/upload/...
/api/v1/sns-settings/...
/api/v1/seo-settings/...
/api/v1/templates/...
/api/v1/notifications/...
/api/v1/ai/...
/api/v1/tenant/features/...     ← 기능 플래그 조회 (테넌트용)

# 공개 API (인증 불필요 - 고객 홈페이지용)
/api/public/site/{tenant_slug}/...
/api/public/inquiries/submit/...
```

---

## 6. 데이터베이스 규칙

### 필수 규칙

1. **모든 테이블에 `tenant_id` 컬럼 필수** (RLS 적용 대상)
2. **PK는 UUID** (`gen_random_uuid()` 기본값)
3. **모든 테이블에 `created_at`, `updated_at` 필수** (TIMESTAMPTZ)
4. **RLS 정책 필수 적용** (테넌트 간 데이터 격리)
5. **소프트 삭제** 원칙: `deleted_at` 컬럼 추가, 실제 DELETE 금지

### RLS 적용 패턴 (모든 테이블 동일)

```sql
-- 항상 이 패턴으로 적용
ALTER TABLE {테이블명} ENABLE ROW LEVEL SECURITY;

CREATE POLICY {테이블명}_tenant_isolation ON {테이블명}
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );
```

### 마이그레이션 규칙

```bash
# 새 마이그레이션 생성 시
cd apps/backend
poetry run alembic revision --autogenerate -m "설명_내용"

# 마이그레이션 적용
poetry run alembic upgrade head

# 롤백
poetry run alembic downgrade -1

# 마이그레이션 파일은 반드시 검토 후 커밋 (autogenerate 100% 신뢰 금지)
```

---

## 7. 인증·권한 규칙

### 7.1 로그인 진입점 (2곳)

고객(테넌트 어드민)은 두 곳에서 로그인할 수 있으며, 두 방법 모두 동일한 계정·동일한 API를 사용한다.

```
진입점 1: admin.도메인.com/login      ← 관리자 페이지 전용 로그인
진입점 2: 도메인.com/{slug}/login     ← 홈페이지에서 직접 로그인
                ↓ 둘 다 동일한 POST /api/v1/auth/login 호출
                ↓ JWT를 .도메인.com 범위 쿠키에 저장
                ↓
[admin.도메인.com]  ←→  [도메인.com]  쿠키 자동 공유
```

### 7.2 공유 도메인 쿠키 전략

Refresh Token을 **상위 도메인 범위 쿠키**로 발급하여 admin 서브도메인과 메인 도메인 간 인증을 공유한다.

```python
# app/api/v1/endpoints/auth.py — 로그인 응답 시 쿠키 설정
response.set_cookie(
    key="refresh_token",
    value=refresh_token,
    httponly=True,           # JS 접근 불가 (XSS 방지)
    secure=True,             # HTTPS only
    samesite="lax",
    domain=".도메인.com",    # ← 핵심: 점(.) 으로 시작 = 서브도메인 공유
    max_age=60 * 60 * 24 * 7  # 7일
)

# 로컬 개발 환경: domain 생략 (localhost는 서브도메인 없음)
# 환경변수로 분기: settings.COOKIE_DOMAIN
```

```python
# app/core/config.py — 환경변수
COOKIE_DOMAIN: str = ""          # 로컬: 빈 문자열
# 프로덕션: ".mysite.com"
```

### 7.3 홈페이지에서 편집 모드 진입 흐름

```
[도메인.com 접속]
    ↓
쿠키 확인 → 로그인 상태?
    ├── YES → 우측 하단 ✏️ [편집 모드] 플로팅 버튼 자동 노출
    └── NO  → 우측 하단 🔐 [관리자 로그인] 플로팅 버튼 노출
                  ↓ 클릭
              로그인 모달 (또는 /{slug}/login 페이지)
                  ↓ 로그인 성공
              ✏️ [편집 모드] 버튼 노출
                  ↓ 클릭
              인라인 편집 모드 진입
```

### 7.4 두 편집 방식의 관계

```
관리자 페이지 (admin.도메인.com)     홈페이지 인라인 편집 (도메인.com)
         ↓                                      ↓
    폼 기반 수정                          클릭해서 직접 수정
         ↓                                      ↓
         └──────────── 동일한 API 호출 ──────────┘
                              ↓
                         동일한 DB 저장
                              ↓
                    홈페이지 즉시 반영 (캐시 퍼지)
```

**어디서 수정하든 결과는 동일. 두 방법은 UX만 다를 뿐이다.**

### 7.5 JWT 구조

```python
# Access Token Payload
{
  "sub": "user_uuid",
  "tenant_id": "tenant_uuid",
  "role": "TENANT_ADMIN",       # SUPER_ADMIN | TENANT_ADMIN | TENANT_VIEWER
  "is_super_admin": False,
  "exp": 1234567890             # 15분
}

# Refresh Token: HttpOnly Cookie (7일, 상위 도메인 범위)
```

### 7.6 의존성 사용 규칙

```python
# 인증 필요 엔드포인트: 반드시 두 의존성 모두 사용
async def endpoint(
    db: AsyncSession = Depends(get_db_with_rls),      # RLS 자동 설정
    current_user: User = Depends(get_current_user),   # 인증 검증
):

# 슈퍼 어드민 전용
async def admin_only_endpoint(
    current_user: User = Depends(get_super_admin),
):

# 공개 API (인증 불필요): 의존성 없음, tenant_id는 URL 파라미터로 수신
```

### 7.7 클라이언트(apps/client) 인증 스토어

```typescript
// apps/client/lib/authStore.ts
interface ClientAuthStore {
  user: User | null
  isLoggedIn: boolean
  isEditMode: boolean

  // 초기화: 페이지 로드 시 GET /api/v1/auth/me 호출
  initialize: () => Promise<void>

  // 로그인: 홈페이지 로그인 모달/페이지에서 사용
  login: (email: string, password: string, tenantSlug: string) => Promise<void>

  // 로그아웃
  logout: () => Promise<void>

  // 편집 모드 토글 (로그인 상태에서만 가능)
  toggleEditMode: () => void
}

// 사용 규칙:
// - apps/client 전용 (apps/admin은 별도 authStore 사용)
// - 페이지 로드 시 initialize() 호출 → 쿠키 기반 자동 로그인 확인
// - isLoggedIn=true 일 때만 편집 버튼 노출
```

---

## 8. 슈퍼 어드민 개발 규칙

### 8.1 접근 분리 원칙

```
슈퍼 어드민(apps/superadmin)은 테넌트 어드민(apps/admin)과 완전히 독립
- 별도 Vite 앱 (:3002)
- 별도 API 경로 (/api/super/v1/)
- 별도 JWT 미들웨어 (get_super_admin 의존성만 허용)
- 별도 Nginx 라우팅 (system.도메인.com)
```

### 8.2 기능 플래그 개발 규칙

```typescript
// apps/admin에서 기능 플래그 사용 패턴
// 절대로 하드코딩하지 말 것 — 항상 featureStore에서 읽기

// ✅ 올바른 패턴
const { features } = useFeatureStore()
{features.AI_MONTHLY_REPORT && <MenuItem path="/admin/reports" />}

// ❌ 금지 패턴
{tenant.plan === 'PREMIUM' && <MenuItem />}  // 플랜 직접 체크 금지
```

```python
# 백엔드에서 기능 플래그 체크 패턴
# app/core/deps.py
async def require_feature(feature_key: str):
    async def checker(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db_with_rls)
    ):
        enabled = await feature_service.is_enabled(db, current_user.tenant_id, feature_key)
        if not enabled:
            raise HTTPException(status_code=403, detail="이 기능은 현재 비활성화되어 있습니다.")
    return checker

# 기능 플래그가 필요한 엔드포인트
@router.post("/ai/monthly-report")
async def generate_monthly_report(
    _=Depends(require_feature("AI_MONTHLY_REPORT")),   # ← 기능 플래그 체크
    current_user=Depends(get_current_user),
):
    ...
```

### 8.3 기능 플래그 캐싱

```python
# Redis에 5분 캐시 (기획서 섹션 14.9 오픈 이슈 #13)
# key: "features:{tenant_id}"
# value: {feature_key: bool, ...} JSON
async def get_tenant_features(tenant_id: str) -> dict:
    cache_key = f"features:{tenant_id}"
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)
    features = await feature_service.get_all(db, tenant_id)
    await redis.setex(cache_key, 300, json.dumps(features))  # 5분
    return features

# 슈퍼 어드민이 기능 변경 시 캐시 즉시 무효화 필수
await redis.delete(f"features:{tenant_id}")
```

### 8.4 감사 로그 자동 기록

```python
# 슈퍼 어드민의 모든 쓰기 작업은 audit_logs에 자동 기록
# app/core/audit.py
async def log_action(db, actor, action, target_type, target_id, before, after):
    await db.execute(insert(AuditLog).values(
        actor_id=actor.id,
        actor_role=actor.role,
        action=action,
        target_type=target_type,
        target_id=target_id,
        before_value=before,
        after_value=after,
    ))

# 사용 예시
await log_action(db, current_user,
    action="FEATURE_TOGGLED",
    target_type="tenant_feature",
    target_id=tenant_id,
    before={"AI_MONTHLY_REPORT": False},
    after={"AI_MONTHLY_REPORT": True}
)
```

---

## 9. 환경변수 관리

### 로컬 개발 환경변수 파일 위치

```
apps/backend/.env              ← Python 환경변수 (git ignore)
apps/admin/.env.local          ← Vite 환경변수 (git ignore)
apps/superadmin/.env.local     ← Vite 환경변수 - 슈퍼어드민 (git ignore)
apps/client/.env.local         ← Next.js 환경변수 (git ignore)
```

### 환경변수 추가 시 반드시 함께 수정

1. 해당 `.env` 파일
2. `.env.example` (실제 값 없이 키만)
3. `apps/backend/app/core/config.py` (Python의 경우 Settings 클래스)

### 인증 관련 핵심 환경변수

```env
# apps/backend/.env
COOKIE_DOMAIN=              # 로컬 개발: 빈 문자열
# COOKIE_DOMAIN=.mysite.com  # 프로덕션: 상위 도메인 (점으로 시작)

ADMIN_BASE_URL=http://localhost:3001   # 관리자 페이지 URL
CLIENT_BASE_URL=http://localhost:3000  # 고객 홈페이지 URL
```

```env
# apps/client/.env.local
NEXT_PUBLIC_ADMIN_URL=http://localhost:3001  # 관리자 페이지 링크용
```

### 절대 커밋 금지

```
.env, .env.local, .env.production
시크릿 키, API 키, 비밀번호가 포함된 모든 파일
```

---

## 10. 로컬 개발 환경 설정 (처음 시작 시)

```bash
# 전제 조건 확인
node --version    # v22.x 이상
pnpm --version    # v9.x 이상
python --version  # 3.13.x
poetry --version  # 2.x
docker --version  # 최신

# 1. 프론트엔드 의존성 설치 (모노레포 전체)
pnpm install

# 2. 백엔드 의존성 설치
cd apps/backend && poetry install && cd ../..

# 3. 환경변수 복사 및 설정
cp apps/backend/.env.example apps/backend/.env
cp apps/admin/.env.example apps/admin/.env.local
cp apps/client/.env.example apps/client/.env.local
# → 각 .env 파일을 열어 실제 값으로 수정

# 4. 인프라 실행
docker compose up -d
# PostgreSQL :5432, Redis :6379, MinIO :9000 확인

# 5. DB 마이그레이션
cd apps/backend
poetry run alembic upgrade head
poetry run python scripts/seed.py   # 초기 데이터 (슈퍼어드민 계정, 템플릿 등)
cd ../..

# 6. 개발 서버 실행 (터미널 4개)
# 터미널 1: 백엔드
cd apps/backend && poetry run uvicorn app.main:app --reload --port 8000

# 터미널 2: Celery 워커
cd apps/backend && poetry run celery -A app.workers.celery_app worker --loglevel=info

# 터미널 3: 관리자 프론트
cd apps/admin && pnpm dev   # http://localhost:3001

# 터미널 4: 고객 홈페이지
cd apps/client && pnpm dev  # http://localhost:3000

# 7. API 문서 확인
# http://localhost:8000/docs (Swagger UI)
# http://localhost:8000/redoc (ReDoc)
```

---

## 11. 테스트 규칙

### 백엔드 (pytest)

```bash
# 전체 테스트
cd apps/backend && poetry run pytest

# 특정 파일만
poetry run pytest tests/test_auth.py -v

# 커버리지 포함
poetry run pytest --cov=app --cov-report=html
```

```python
# 테스트 작성 규칙
# 1. 모든 API 엔드포인트는 테스트 필수
# 2. 테스트 DB는 별도 (테스트용 PostgreSQL 또는 SQLite)
# 3. 각 테스트는 독립적 (다른 테스트에 의존 금지)
# 4. conftest.py에서 테스트 픽스처 관리

# tests/conftest.py 기본 구조
@pytest.fixture
async def test_tenant():
    # 테스트용 테넌트 생성 → yield → 정리
    ...

@pytest.fixture
async def auth_headers(test_tenant):
    # 테스트용 JWT 헤더 반환
    ...
```

### 프론트엔드 (Vitest)

```bash
# 전체 테스트
cd apps/admin && pnpm test

# 감시 모드
pnpm test:watch
```

---

## 12. Git 워크플로우 규칙 (필수 — 건너뛸 수 없음)

### 12.1 커밋 메시지 형식 (엄수)

```
feat(scope): 설명

┌─────────────────────────────────────────────────────┐
│  형식: <타입>(<범위>): <설명>                         │
│                                                     │
│  타입 (소문자 고정):                                  │
│    feat     새 기능 구현                              │
│    fix      버그 수정                                 │
│    refactor 리팩토링 (기능 변화 없음)                  │
│    test     테스트 추가·수정                          │
│    docs     문서 수정 (CLAUDE.md, 기획서 등)           │
│    chore    빌드·설정·의존성 변경                      │
│    db       DB 마이그레이션 파일                       │
│    style    코드 포맷·린트 수정                        │
│                                                     │
│  범위 (소문자 고정):                                  │
│    backend    FastAPI 백엔드                         │
│    admin      관리자 프론트엔드 (apps/admin)           │
│    client     고객 홈페이지 (apps/client)             │
│    superadmin 슈퍼 어드민 (apps/superadmin)           │
│    packages   공통 패키지 (packages/ui, types)        │
│    infra      Docker, Nginx, CI/CD                  │
│    claude     CLAUDE.md 수정                         │
└─────────────────────────────────────────────────────┘

✅ 올바른 예시:
  feat(backend): 섹션 순서 변경 PATCH API 구현
  feat(admin): 섹션 드래그앤드롭 낙관적 업데이트 구현
  fix(backend): 문의 접수 시 알림톡 미발송 버그 수정
  test(backend): 섹션 CRUD API 단위 테스트 추가
  db: tenant_features 테이블 마이그레이션 추가
  docs(claude): 기획서 v1.4 반영 CLAUDE.md 버전 동기화
  refactor(client): EditableText 컴포넌트 훅 분리

❌ 잘못된 예시:
  "fix bug"                        ← 범위·설명 없음
  "FEAT(Backend): 기능추가"         ← 대문자 사용
  "feat: 여러가지 기능 추가 및 버그 수정" ← 하나의 커밋에 여러 작업 혼합
```

### 12.2 커밋 전 필수 완료 조건 (체크리스트)

```
커밋하기 전 아래를 모두 통과해야 한다.
통과하지 않으면 커밋 불가 — 건너뛸 수 없다.

[ ] 1. 검증 통과 (섹션 12.4 참조)
[ ] 2. 테스트 작성 완료 + 통과 (섹션 12.5 참조)
[ ] 3. 린트 에러 0개
[ ] 4. 커밋 메시지 형식 준수 (12.1 참조)
[ ] 5. TASK.md 해당 태스크 [x] 체크
```

### 12.3 Git Worktree 전략 (master 직접 수정 절대 금지)

**master(main) 브랜치에서 src 코드를 직접 수정하는 것은 절대 금지한다.**
모든 작업은 worktree를 통해 별도 브랜치에서 진행한다.

```bash
# ── 작업 시작 시 (T-XXX 번호 사용) ──────────────────────────────

# 1. 현재 브랜치 상태 확인
git status                          # 반드시 clean 상태여야 함
git checkout develop                # develop 기준으로 시작
git pull origin develop             # 최신 상태 동기화

# 2. worktree 생성 (기능 개발)
git worktree add ../cms-T-016 feat/T-016
cd ../cms-T-016                     # worktree 디렉토리에서 작업

# 3. 작업 완료 후 커밋
git add .
git commit -m "feat(backend): 섹션 CRUD API 구현 (T-016)"

# 4. develop 브랜치에 머지 (PR 또는 직접 머지)
git checkout develop
git merge feat/T-016 --no-ff        # --no-ff: 머지 커밋 생성 (이력 보존)
git push origin develop

# 5. worktree 정리
git worktree remove ../cms-T-016
git branch -d feat/T-016            # 로컬 브랜치 삭제

# ── 브랜치 네이밍 ────────────────────────────────────────────────
feat/T-XXX      ← 기능 개발 (TASK.md 번호)
fix/T-XXX       ← 버그 수정
refactor/T-XXX  ← 리팩토링
test/T-XXX      ← 테스트 추가
docs/update     ← 문서 수정

# ── 절대 금지 ────────────────────────────────────────────────────
git checkout main && 코드 수정      ← 금지
git push origin main               ← 금지 (CI에서 차단)
git commit -m "wip" or "수정"       ← 의미없는 커밋 메시지 금지
```

### 12.4 검증 실행 필수 (건너뛸 수 없음)

**검증을 통과하지 않으면 커밋하지 않는다. 예외 없음.**

```bash
# ── 백엔드 검증 (apps/backend) ───────────────────────────────────
cd apps/backend

# 1. 린트 검사
poetry run ruff check app/           # 린트 에러 0개 필수
poetry run ruff format --check app/  # 포맷 검사

# 2. 타입 검사
poetry run mypy app/ --ignore-missing-imports

# 3. 테스트 실행 (다음 섹션 참조)
poetry run pytest tests/ -v --tb=short

# 4. 커버리지 확인 (70% 이상 필수)
poetry run pytest --cov=app --cov-report=term-missing --cov-fail-under=70

# ── 프론트엔드 검증 (apps/admin, apps/client, apps/superadmin) ────
cd apps/admin  # 또는 client, superadmin

# 1. 린트 검사
pnpm lint                            # ESLint 에러 0개 필수

# 2. 타입 검사
pnpm type-check                      # TypeScript 에러 0개 필수

# 3. 테스트 실행
pnpm test --run                      # Vitest 전체 통과 필수

# 4. 빌드 확인 (배포 전)
pnpm build                           # 빌드 에러 0개 필수

# ── 전체 검증 한 번에 실행 (루트에서) ────────────────────────────
pnpm validate                        # package.json scripts에 등록된 전체 검증

# 검증 실패 시:
# ❌ 커밋 불가
# ❌ "일단 커밋하고 나중에 고친다" 허용 안 됨
# ✅ 에러를 먼저 수정하고 재검증 후 커밋
```

### 12.5 테스트 작성 필수 (건너뛸 수 없음)

**모든 구현 기능에 대한 단위 테스트를 반드시 작성한다.**
테스트 없이 작성된 코드는 완료로 인정하지 않는다.

```python
# ── 백엔드 테스트 규칙 ──────────────────────────────────────────

# 테스트 파일 위치: tests/ 디렉토리 (앱 구조 미러링)
# apps/backend/app/api/v1/endpoints/sections.py
# → tests/test_sections.py

# 필수 테스트 케이스 (API 엔드포인트 기준)
# 1. 정상 케이스 (200/201 응답)
# 2. 인증 실패 (401)
# 3. 권한 없음 (403) — 특히 RLS 격리 검증
# 4. 입력값 검증 실패 (400/422)
# 5. 존재하지 않는 리소스 (404)
# 6. 플랜 한도 초과 (422 PLAN_LIMIT_EXCEEDED)

# 테스트 작성 예시
@pytest.mark.asyncio
async def test_update_section_title_success(client, auth_headers, test_section):
    """정상: 섹션 타이틀 수정"""
    response = await client.patch(
        f"/api/v1/sections/{test_section.id}",
        json={"main_title": "새로운 타이틀"},
        headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["data"]["settings"]["main_title"] == "새로운 타이틀"

@pytest.mark.asyncio
async def test_update_section_title_too_long(client, auth_headers, test_section):
    """실패: 40자 초과 타이틀"""
    response = await client.patch(
        f"/api/v1/sections/{test_section.id}",
        json={"main_title": "a" * 41},
        headers=auth_headers
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"

@pytest.mark.asyncio
async def test_update_section_other_tenant_forbidden(client, other_tenant_headers, test_section):
    """실패: 다른 테넌트 섹션 접근 → RLS 격리"""
    response = await client.patch(
        f"/api/v1/sections/{test_section.id}",
        json={"main_title": "해킹 시도"},
        headers=other_tenant_headers   # 다른 테넌트 토큰
    )
    assert response.status_code == 403
```

```typescript
// ── 프론트엔드 테스트 규칙 (Vitest) ─────────────────────────────

// 테스트 파일 위치: 컴포넌트 옆 __tests__/ 또는 .test.tsx
// apps/admin/src/components/content/HeroBannerForm.tsx
// → apps/admin/src/components/content/__tests__/HeroBannerForm.test.tsx

// 필수 테스트 케이스 (컴포넌트 기준)
// 1. 정상 렌더링
// 2. 사용자 입력 → 상태 변경
// 3. 유효성 검사 실패 메시지 노출
// 4. API 호출 성공 시 동작
// 5. API 호출 실패 시 에러 처리

// 스토어(Zustand) 단위 테스트 필수
// 훅(hook) 단위 테스트 필수

// MSW(Mock Service Worker)로 API 모킹
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

const server = setupServer(
  http.patch('/api/v1/sections/:id', () => {
    return HttpResponse.json({ success: true, data: { ... } })
  })
)
```

### 12.6 작업 플랜 작성 필수 (계획 없이 코드 작성 금지)

**모든 작업은 코드 작성 전에 플랜을 먼저 작성하고 검토한다.**
계획 없이 바로 코드를 작성하는 것은 허용되지 않는다.

```
[플랜 작성 형식]

## T-XXX 작업 플랜

### 1. 작업 범위
- 구현할 파일 목록 (신규/수정 구분)
- 영향받는 기존 파일

### 2. 구현 순서
1. 백엔드 모델/스키마
2. 서비스 레이어
3. API 엔드포인트
4. 테스트 작성
5. 프론트엔드 연동

### 3. 고려사항
- 엣지 케이스
- 기존 코드와의 의존성
- 플랜 한도 체크 필요 여부
- RLS 적용 필요 여부

### 4. 완료 조건
- TASK.md의 완료 조건 항목들

→ 위 플랜을 먼저 제시하고 승인 후 코드 작성 시작
```

### 12.7 머지 완료 처리 절차

태스크 완료 시 아래 순서를 반드시 따른다.

```bash
# ── 1. 최종 검증 통과 확인 ────────────────────────────────────
pnpm validate          # 전체 린트·타입·테스트 통과

# ── 2. develop 브랜치에 머지 ──────────────────────────────────
git checkout develop
git merge feat/T-XXX --no-ff -m "feat(scope): T-XXX 태스크명 완료"
git push origin develop

# ── 3. 브랜치 정리 ────────────────────────────────────────────
git worktree remove ../cms-T-XXX
git branch -d feat/T-XXX

# ── 4. TASK.md 업데이트 ───────────────────────────────────────
# 해당 태스크를 [ ] → [x] 로 변경
# 전체 진행 현황 테이블 완료 수 업데이트

# ── 5. 완료 커밋 ──────────────────────────────────────────────
git add TASK.md
git commit -m "chore(claude): T-XXX 완료 처리 TASK.md 업데이트"
git push origin develop

# ── 머지 완료 선언 형식 ───────────────────────────────────────
"T-XXX [태스크명] 완료.
 - 구현: [주요 구현 내용 1줄]
 - 테스트: [테스트 케이스 수]개 작성, 전체 통과
 - 커밋: feat(scope): 설명
 - 다음 태스크: T-XXX+1"
```

---

## 13. Claude에게 태스크 지시하는 방법

### 13.1 Claude의 작업 순서 (자동 적용)

Claude는 태스크를 받으면 반드시 아래 순서로 진행한다.

```
1. CLAUDE.md + TASK.md 읽기          (필수 — 건너뛸 수 없음)
2. 문서 버전 확인                    (섹션 0)
3. 플랜 작성 및 제시                  (섹션 12.6)
     ↓ 사용자 승인 후
4. worktree 브랜치 생성              (섹션 12.3)
5. 코드 구현 (서비스 → API → 테스트 순)
6. 테스트 작성 + 통과               (섹션 12.5)
7. 검증 실행 + 통과                 (섹션 12.4)
8. 커밋                            (섹션 12.1)
9. develop 머지 + 브랜치 정리       (섹션 12.7)
10. TASK.md [x] 체크 + 완료 선언
```

### 13.2 효과적인 지시 패턴

```
# ✅ 표준 지시 템플릿
"CLAUDE.md와 TASK.md를 읽어줘.
 T-016 작업을 시작할 거야.
 먼저 플랜을 작성해줘. 승인 후 코드 작성을 시작해."

# ✅ 컨텍스트 추가 패턴
"CLAUDE.md와 TASK.md를 읽어줘.
 T-026 이미지 업로드 API 구현해줘.
 - 기획서 섹션 5.4 참조
 - Pillow WebP 변환 필수
 - 플랜 먼저 보여줘"

# ❌ 금지 패턴
"업로드 기능 만들어줘"          ← 범위 불명확
"플랜 생략하고 바로 코드 짜줘"   ← 플랜 생략 금지
"테스트는 나중에 써줘"          ← 테스트 지연 금지
"일단 커밋하고 검증은 나중에"    ← 검증 생략 금지
"main 브랜치에서 바로 수정해줘"  ← worktree 규칙 위반
```

### 13.3 작업 단위 원칙

- **하나의 대화 = 하나의 태스크** (T-XXX 단위)
- 태스크가 크면 Claude가 세부 플랜으로 쪼개서 제시
- 플랜 승인 없이 코드 작성 시작 금지

### 13.4 대화 시작 템플릿 (복사해서 사용)

```
CLAUDE.md와 TASK.md를 읽어줘.

오늘 작업: T-XXX ([태스크명])
참조: 기획서 섹션 X.X

플랜을 먼저 작성해줘. 승인 후 코드 작성 시작해.
완료되면 검증 실행하고 커밋 형식 맞춰서 커밋해줘.
TASK.md에서 T-XXX를 [x]로 체크하고 완료 선언해줘.
```

---

## 14. 자주 참조하는 파일 위치

| 필요한 정보 | 파일 경로 |
|---|---|
| 전체 기획·API 스펙 | `docs/CMS_Admin_Specification_v1.4.md` |
| 개발 태스크 목록 | `TASK.md` |
| 환경변수 목록 | `apps/backend/.env.example` |
| DB 마이그레이션 | `apps/backend/alembic/versions/` |
| 공통 타입 정의 | `packages/types/src/` |
| FastAPI 앱 진입점 | `apps/backend/app/main.py` |
| 라우터 등록 | `apps/backend/app/api/v1/router.py` |
| 슈퍼 어드민 앱 | `apps/superadmin/src/` ★ |
| 기능 플래그 서비스 | `apps/backend/app/services/feature.py` ★ |
| 슈퍼 어드민 API | `apps/backend/app/api/super/` ★ |
| 감사 로그 | `apps/backend/app/core/audit.py` ★ |
| 관리자 Zustand 스토어 | `apps/admin/src/stores/authStore.ts` |
| 클라이언트 인증 스토어 | `apps/client/lib/authStore.ts` ★ |
| 편집 모드 스토어 | `apps/client/lib/editStore.ts` |
| 홈페이지 로그인 컴포넌트 | `apps/client/components/auth/` ★ |
| Docker 설정 | `docker-compose.yml` |

---

*이 파일은 기획서 버전 업데이트 시 자동으로 동기화된다.*
*Claude Code는 작업 시작 전 반드시 이 파일을 읽고 섹션 0의 버전을 확인한다.*
*모든 규칙은 선택이 아닌 필수다. 예외는 없다.*
