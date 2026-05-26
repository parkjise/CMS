# 멀티 테넌트 대응형 가변 CMS 관리자 시스템
## 상세 기술 기획서 (Technical Product Specification)

**문서 버전:** v1.4  
**작성일:** 2026-05-24  
**최종 수정:** 2026-05-24 (v1.4: 슈퍼 어드민 시스템 전체 기획 추가 — 섹션 14)  
**대상 독자:** 개발팀 내부 (풀스택 개발자, 백엔드 엔지니어, DBA)  
**문서 분류:** 기밀 (Internal Only)

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [시스템 아키텍처](#2-시스템-아키텍처)
3. [비즈니스 모델 및 수익 구조](#3-비즈니스-모델-및-수익-구조)
4. [화면 설계 (Wireframe Specification)](#4-화면-설계-wireframe-specification)
5. [API 기술 스펙](#5-api-기술-스펙)
6. [데이터베이스 스키마 설계](#6-데이터베이스-스키마-설계)
7. [핵심 기능 상세 구현 가이드](#7-핵심-기능-상세-구현-가이드)
8. [비기능 요구사항 (NFR)](#8-비기능-요구사항-nfr)
9. [개발 환경 및 기술 스택](#9-개발-환경-및-기술-스택)
10. [오픈 이슈 및 결정 필요 사항](#10-오픈-이슈-및-결정-필요-사항)
11. [템플릿 선택 시스템](#11-템플릿-선택-시스템-multi-template-architecture)
12. [인라인 편집 모드](#12-인라인-편집-모드-live-edit-mode)
13. [AI 편집 어시스턴트](#13-ai-편집-어시스턴트-ai-edit-assistant)
14. [슈퍼 어드민 시스템](#14-슈퍼-어드민-시스템-super-admin-system)

---

## 1. 프로젝트 개요

### 1.1 배경 및 목적

소상공인(병원, 펜션, 스타트업 등)은 홈페이지 운영 시 다음 3가지 공통 고통(Pain Point)을 가진다.

| # | Pain Point | 기존 해결 방식의 한계 |
|---|---|---|
| 1 | 텍스트·이미지 수정 시마다 개발사에 의뢰 | 수정 단가 발생, 평균 2~5일 소요 |
| 2 | SNS·카카오톡 채널 직접 연결 불가 | 별도 플러그인 구매 또는 외주 필요 |
| 3 | 고객 문의 관리 시스템 부재 | 이메일·DM 수동 확인, 누락 빈번 |

본 시스템은 **"하나의 관리자 코드베이스로 N개의 클라이언트 사이트"**를 운영하는 멀티 테넌트 SaaS CMS를 구축하여 위 문제를 해결한다.

### 1.2 핵심 설계 원칙

- **One-Code, Multiple Webs**: 마스터 템플릿 1개 → 테넌트별 기능 On/Off
- **Zero-Coding for End User**: 모든 노출 콘텐츠는 DB → 관리자 UI → 실시간 반영
- **Tenant Isolation**: 테넌트 간 데이터 완전 격리 (Row-Level Security 적용)

### 1.3 용어 정의

| 용어 | 정의 |
|---|---|
| 테넌트(Tenant) | 시스템을 사용하는 개별 사업체 (예: OO의원, 강원펜션) |
| 템플릿 타입(Template Type) | 테넌트 업종 분류 (HOSPITAL / PENSION / STARTUP / GENERAL) |
| 섹션(Section) | 홈페이지 메인 화면을 구성하는 독립적 콘텐츠 블록 |
| 슈퍼 어드민 | 시스템 전체를 관리하는 운영사(우리 회사) 계정 |
| 테넌트 어드민 | 개별 사업체의 홈페이지 관리자 계정 |

---

## 2. 시스템 아키텍처

### 2.1 전체 시스템 구성도

```
┌──────────────────────────────────────────────────────────────────────┐
│                    CLIENT LAYER  (pnpm 모노레포)                       │
│                                                                      │
│  ┌─────────────────────────┐   ┌──────────────────────────────────┐  │
│  │  apps/admin             │   │  apps/client                     │  │
│  │  관리자 페이지            │   │  고객 홈페이지 (테넌트별)           │  │
│  │  React 18 + Vite        │   │  Next.js 15 (SSR/SSG)            │  │
│  │  TypeScript  :3001      │   │  TypeScript  :3000               │  │
│  └─────────────────────────┘   └──────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │  packages/ui  공통 컴포넌트  |  packages/types  공통 TS 타입   │   │
│  └───────────────────────────────────────────────────────────────┘   │
└─────────────────────────────┬────────────────────────────────────────┘
                              │ HTTPS / REST API
┌─────────────────────────────▼────────────────────────────────────────┐
│                      API GATEWAY (Nginx)                              │
│   /api/admin/* → Admin API  |  /api/public/* → Public API            │
│              Rate Limiting / SSL Termination / Routing                │
└──────────────┬───────────────────────────────────┬────────────────────┘
               │                                   │
┌──────────────▼──────────────┐   ┌───────────────▼────────────────────┐
│  CMS Admin API               │   │  Public Site API                   │
│  FastAPI (Python 3.13)       │   │  FastAPI (Python 3.13)             │
│  - 관리자 CRUD API            │   │  - 공개 콘텐츠 Read API              │
│  - 파일 업로드 + 이미지 최적화  │   │  - 문의 폼 Submit API               │
│  - 알림 발송 트리거            │   │  - SEO 메타 제공 API                │
│  - AI Manager 연동            │   │                                    │
│  :8000                       │   │  :8001                             │
└──────────────┬───────────────┘   └───────────────┬────────────────────┘
               │                                   │
┌──────────────▼───────────────────────────────────▼────────────────────┐
│                    ASYNC WORKER LAYER                                  │
│              Celery 5.x + Redis  (비동기 작업 큐)                        │
│   알림톡/SMS 발송  |  이미지 최적화  |  AI 문의 분류  |  월간 리포트       │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│                           DATABASE LAYER                                │
│  ┌──────────────────┐  ┌────────────────┐  ┌──────────────────────┐    │
│  │  PostgreSQL 17   │  │  Redis 8.x     │  │  MinIO / S3          │    │
│  │  RLS 적용         │  │  캐시/세션/    │  │  이미지 스토리지       │    │
│  │  (메인 RDB)       │  │  Pub/Sub/큐    │  │  CDN 연동             │    │
│  └──────────────────┘  └────────────────┘  └──────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│                         EXTERNAL SERVICES                               │
│     [카카오 알림톡]  [네이버 클라우드 SENS]  [OpenAI API / AI Manager]    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 멀티 테넌트 격리 전략

**방식: Shared Database, Shared Schema + Row-Level Security**

모든 테이블에 `tenant_id` 컬럼을 두고, PostgreSQL의 Row-Level Security(RLS) 정책으로 테넌트 간 데이터 접근을 DB 레벨에서 차단한다.

```sql
-- RLS 정책 예시
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON site_settings
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

API 서버는 모든 요청 처리 전 DB 세션에 RLS 컨텍스트를 설정한다.

```python
# app/db/session.py  - RLS 미들웨어
from sqlalchemy.ext.asyncio import AsyncSession

async def set_rls_context(db: AsyncSession, tenant_id: str, is_super_admin: bool = False):
    """모든 API 요청 진입점에서 호출 - RLS 테넌트 격리 적용"""
    await db.execute(
        text("SET LOCAL app.current_tenant_id = :tid"),
        {"tid": str(tenant_id)}
    )
    await db.execute(
        text("SET LOCAL app.is_super_admin = :flag"),
        {"flag": "true" if is_super_admin else "false"}
    )

# FastAPI 의존성으로 자동 적용
async def get_db_with_rls(
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> AsyncSession:
    await set_rls_context(db, current_user.tenant_id, current_user.is_super_admin)
    yield db
```

### 2.3 인증 아키텍처

```
[로그인 요청] → [JWT Access Token 발급 (15분)]
                + [Refresh Token 발급 (7일, HttpOnly Cookie)]
                
[API 요청]    → Authorization: Bearer {access_token}
             → 미들웨어: 토큰 검증 → tenant_id 추출 → RLS 세션 설정
             
[토큰 만료]   → /auth/refresh 엔드포인트 → 새 Access Token 발급
```

---

## 3. 비즈니스 모델 및 수익 구조

### 3.1 타겟 고객 세그먼트

| 세그먼트 | 예시 업종 | 주요 니즈 | 예상 월 지불 의향 |
|---|---|---|---|
| 소형 병의원 | 의원, 치과, 한의원 | 예약 문의 관리, SEO | 15~30만원 |
| 숙박업 | 펜션, 게스트하우스, 풀빌라 | 예약 문의, 갤러리 | 10~20만원 |
| 스타트업 | 초기 창업팀, 1인 기업 | 빠른 런칭, 제휴 문의 | 5~15만원 |
| 일반 소상공인 | 음식점, 미용실, 학원 | 기본 소개 + SNS 연동 | 3~10만원 |

### 3.2 요금제 플랜 구조

| 구분 | BASIC | STANDARD | PREMIUM |
|---|---|---|---|
| **월 요금** | 39,000원 | 89,000원 | 189,000원 |
| 페이지 섹션 수 | 5개 고정 | 10개 + 순서 변경 | 무제한 + 드래그 정렬 |
| 이미지 스토리지 | 1GB | 5GB | 20GB |
| 문의 보관 기간 | 30일 | 180일 | 무제한 |
| 알림톡/SMS | ❌ | 월 100건 | 무제한 |
| SEO 마법사 | 기본 (제목/설명) | 고급 (키워드 + 시트맵) | 풀옵션 + 분석 리포트 |
| SNS 연동 채널 수 | 2개 | 4개 | 무제한 |
| 기술 지원 | 이메일 (5영업일) | 이메일 (1영업일) | 전담 슬랙 채널 |
| **추천 대상** | 개인사업자 초기 | 활성 운영 업체 | 마케팅 집중 업체 |

### 3.3 수익 시뮬레이션

**목표: 12개월 내 손익분기점 달성**

| 시점 | BASIC | STANDARD | PREMIUM | 월 MRR |
|---|---|---|---|---|
| M+3 | 30 | 10 | 2 | 약 235만원 |
| M+6 | 80 | 35 | 8 | 약 790만원 |
| M+12 | 200 | 100 | 30 | 약 2,190만원 |

**추가 수익원:**
- 초기 구축비: 템플릿 셋업 + 도메인 연결 + 초기 콘텐츠 세팅 = 30~100만원 (1회)
- 알림톡 초과 발송: 건당 8.5원 (네이버 클라우드 SMS API 원가 이상 마진)
- 디자인 커스터마이징: 별도 견적 (서브 에이전시 구조)

### 3.4 CAC & LTV 목표

| 지표 | 목표값 | 비고 |
|---|---|---|
| CAC (고객 획득 비용) | ≤ 15만원 | SEO + 네이버 플레이스 중심 |
| LTV (고객 생애 가치) | ≥ 180만원 | 평균 24개월 유지 가정 |
| LTV/CAC | ≥ 12x | SaaS 건전성 지표 |
| Churn Rate 목표 | ≤ 4%/월 | 초기 목표 |

---

## 4. 화면 설계 (Wireframe Specification)

> **범례:**  
> `[BTN]` = 버튼 컴포넌트  
> `[INP]` = 텍스트 입력 필드  
> `[TGL]` = 토글 스위치  
> `[DRP]` = 드롭다운 셀렉트  
> `[TAB]` = 탭 컴포넌트  
> `※` = 개발 구현 주의사항

---

### AD-01: 대시보드 (Dashboard)

**URL:** `/admin/dashboard`  
**접근 권한:** TENANT_ADMIN, SUPER_ADMIN  
**목적:** 사이트 운영 현황 요약 및 주요 메뉴 허브

```
┌────────────────────────────────────────────────────────────────────┐
│  🏥 OO의원 관리자           [내 사이트 바로가기 ↗]  [로그아웃]      │
│  현재 플랜: STANDARD   템플릿: HOSPITAL                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [사이드바 네비게이션]         [메인 콘텐츠 영역]                      │
│  ┌────────────────┐           ┌──────────────────────────────────┐│
│  │ 📊 대시보드    │◀현재      │  ┌──────────┐  ┌──────────────┐  ││
│  │ 🖼️  콘텐츠 편집│           │  │  오늘 방문│  │  신규 문의   │  ││
│  │ 🔗 SNS 연동   │           │  │   124 명  │  │   3 건 🔴   │  ││
│  │ 📋 문의 관리  │           │  └──────────┘  └──────────────┘  ││
│  │ ⚙️  SEO 설정  │           │  ┌──────────┐  ┌──────────────┐  ││
│  │ 🔔 알림 설정  │           │  │ 이번주 방문│  │  미처리 문의  │  ││
│  │ 💳 요금제     │           │  │   891 명  │  │   7 건 🟡   │  ││
│  └────────────────┘           │  └──────────┘  └──────────────┘  ││
│                               │                                    ││
│                               │  방문자 추이 (최근 7일)             ││
│                               │  ┌────────────────────────────┐   ││
│                               │  │  Line Chart                │   ││
│                               │  │  (일별 방문자 수, 간략히)    │   ││
│                               │  └────────────────────────────┘   ││
│                               │                                    ││
│                               │  최근 미확인 문의                   ││
│                               │  ┌────────────────────────────┐   ││
│                               │  │ 🔴 [홍길동] 진료 문의 - 5분전│   ││
│                               │  │ 🔴 [이영희] 예약 문의 - 1시간│   ││
│                               │  │ 🟡 [박철수] 일반 문의 - 3시간│   ││
│                               │  │           [전체보기 →]      │   ││
│                               │  └────────────────────────────┘   ││
│                               └──────────────────────────────────┘│
└────────────────────────────────────────────────────────────────────┘
```

**컴포넌트 상세:**

| 컴포넌트 | 데이터 소스 | 갱신 주기 | 비고 |
|---|---|---|---|
| 오늘 방문자 | `site_analytics.daily_visits` | 1시간 캐시 (Redis) | UA 파싱 또는 GA4 연동 |
| 신규 문의 건수 | `inquiries WHERE status='PENDING'` | 실시간 (SSE) | 빨간 배지 노출 |
| 이번주 방문자 | `site_analytics` 7일 합산 | 1시간 캐시 | |
| 미확인 문의 목록 | `inquiries` 최근 5건 | 30초 폴링 또는 SSE | |
| Line Chart | `site_analytics` 7일 데이터 | 1시간 캐시 | Chart.js / Recharts |

**※ 구현 주의사항:**
- 방문자 데이터는 자체 수집 vs GA4 Reporting API 중 결정 필요 (→ 10. 오픈 이슈 #1)
- 미확인 문의 실시간성: SSE(Server-Sent Events) 권장, WebSocket은 오버스펙

---

### AD-02: 콘텐츠 편집기 (Visual & Section Editor)

**URL:** `/admin/content`  
**접근 권한:** TENANT_ADMIN  
**목적:** 비개발자가 메인 화면 섹션·텍스트·이미지를 직접 수정

#### AD-02-A: 섹션 목록 및 순서 관리

```
┌────────────────────────────────────────────────────────────────────┐
│  콘텐츠 편집                              [미리보기] [변경사항 저장]  │
├──────────────────────────────────────────────────────────────────┤
│  [TAB: 섹션 관리] [TAB: 공통 설정]                                  │
│                                                                    │
│  섹션 순서를 드래그하여 변경할 수 있습니다.                           │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  ≡  📸 메인 비주얼 (히어로 배너)          [TGL: ON ]  [편집▼] │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │  ≡  🏥 병원 소개                          [TGL: ON ]  [편집▼] │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │  ≡  🩺 진료 과목                          [TGL: ON ]  [편집▼] │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │  ≡  🗓️  온라인 예약 안내                  [TGL: OFF]  [편집▼] │  │
│  │       └─ ⚠️ 비활성화됨 - 홈페이지에 표시되지 않습니다          │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │  ≡  📍 오시는 길 (지도)                   [TGL: ON ]  [편집▼] │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │  ≡  📝 고객 문의                          [TGL: ON ]  [편집▼] │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  [+ 섹션 추가] ← STANDARD 이상 플랜                                │
└────────────────────────────────────────────────────────────────────┘
```

**드래그 앤 드롭 구현 스펙:**
- 라이브러리: `@dnd-kit/core` + `@dnd-kit/sortable` (React DnD 대비 접근성 우수)
- 순서 저장: 드롭 완료 이벤트 → `PATCH /api/sections/order` (배열 인덱스 전송)
- 낙관적 업데이트(Optimistic Update) 적용: UI 즉시 반영 후 API 응답 검증

#### AD-02-B: 섹션 개별 편집 (메인 비주얼 예시)

```
┌────────────────────────────────────────────────────────────────────┐
│  ← 섹션 목록으로   |  ■ 메인 비주얼 섹션 편집          [TGL: ON]  │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [TAB: 기본 설정] [TAB: 모바일 설정] [TAB: 고급 설정]               │
│                                                                    │
│  ┌─── 기본 설정 ────────────────────────────────────────────────┐  │
│  │                                                              │  │
│  │  메인 타이틀 *                                                │  │
│  │  [INP: 강남 최고의 통증의학과, OO의원          ] 18/40자     │  │
│  │  ※ 40자 초과 시 저장 불가, 실시간 카운터 표시                │  │
│  │                                                              │  │
│  │  서브 카피 문구                                               │  │
│  │  [INP: 비수술적 치료로 당신의 관절 건강을 지킵니다.   ]       │  │
│  │                                                 22/80자      │  │
│  │                                                              │  │
│  │  배경 이미지 *                                                │  │
│  │  ┌─────────────────────────────────────────────────────┐    │  │
│  │  │              드래그 앤 드롭 영역                      │    │  │
│  │  │    🖼️  이미지를 여기에 끌어다 놓거나                   │    │  │
│  │  │    [파일 선택] 버튼을 클릭하세요                       │    │  │
│  │  │    권장: 1920×1080px / JPG, PNG, WebP / 최대 20MB   │    │  │
│  │  └─────────────────────────────────────────────────────┘    │  │
│  │  현재 파일: [main_banner_v3.jpg] [미리보기] [삭제]            │  │
│  │  ✅ 자동 최적화 완료: 원본 8.2MB → WebP 변환 후 340KB        │  │
│  │                                                              │  │
│  │  CTA 버튼 설정                                                │  │
│  │  버튼 문구:  [INP: 온라인 상담하기                  ]         │  │
│  │  링크 URL:   [INP: /contact                        ]         │  │
│  │  버튼 스타일: [DRP: 채워진 버튼 ▾]                            │  │
│  │  새 창 열기: [TGL: OFF]                                       │  │
│  │                                                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  [취소]                                    [변경사항 저장]          │
└────────────────────────────────────────────────────────────────────┘
```

**이미지 업로드 처리 플로우:**

```
[사용자 파일 선택]
      ↓
[프론트엔드: 파일 타입 검증] → 실패: "JPG, PNG, WebP, GIF만 가능합니다" 토스트
      ↓ 성공
[프론트엔드: 파일 크기 확인]
  - 20MB 초과: "파일이 너무 큽니다 (최대 20MB)" 에러 표시
  - 5MB 이하: 그대로 업로드
  - 5MB 초과 ~ 20MB 이하: "이미지가 큽니다. 자동으로 최적화됩니다." 안내
      ↓
[POST /api/upload/image]
      ↓
[서버: Pillow 처리]
  1. 메타데이터 확인 (exif 기반 실제 크기)
  2. 최대 1920px로 리사이즈 (비율 유지)
  3. WebP 변환 (quality: 82)
  4. 원본 파일도 별도 보존 (복구용)
      ↓
[MinIO/S3 업로드]
  - 경로: /{tenant_id}/sections/{section_id}/{uuid}.webp
      ↓
[DB 업데이트: section_settings.image_url]
      ↓
[응답: {original_size, optimized_size, url}]
      ↓
[프론트엔드: 최적화 결과 토스트 표시]
"✅ 8.2MB → 340KB로 최적화되었습니다."
```

---

### AD-03: SNS 및 채널 연동 설정

**URL:** `/admin/sns`  
**접근 권한:** TENANT_ADMIN

```
┌────────────────────────────────────────────────────────────────────┐
│  SNS 및 채널 연동 설정                                               │
│  홈페이지 하단(푸터) 및 플로팅 버튼에 자동으로 적용됩니다.              │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─── SNS 채널 연동 ────────────────────────────────────────────┐  │
│  │                                                              │  │
│  │  📷 인스타그램                              [TGL: ON ]        │  │
│  │  [INP: https://instagram.com/my_hospital   ]  [연결 테스트]  │  │
│  │  ✅ 연결됨 (@my_hospital, 팔로워 1,240명)                     │  │
│  │                                                              │  │
│  │  📝 네이버 블로그                           [TGL: ON ]        │  │
│  │  [INP: https://blog.naver.com/my_hospital  ]  [연결 테스트]  │  │
│  │  ✅ 연결됨                                                    │  │
│  │                                                              │  │
│  │  💬 카카오톡 채널                           [TGL: ON ]        │  │
│  │  [INP: https://pf.kakao.com/_xAbCdE        ]  [연결 테스트]  │  │
│  │  ✅ 연결됨 (OO의원 카카오톡 채널)                              │  │
│  │                                                              │  │
│  │  ▶️  유튜브                                 [TGL: OFF]        │  │
│  │  [INP:                                     ]  [연결 테스트]  │  │
│  │  - URL을 입력하고 토글을 켜면 활성화됩니다.                     │  │
│  │                                                              │  │
│  │  📘 페이스북                               [TGL: OFF]        │  │
│  │  [INP:                                     ]  [연결 테스트]  │  │
│  │                                                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─── 노출 위치 설정 ────────────────────────────────────────────┐  │
│  │  ☑ 푸터(Footer)에 아이콘 노출                                 │  │
│  │  ☑ 플로팅 버튼으로 노출 (카카오톡만)                           │  │
│  │  플로팅 버튼 위치: [DRP: 우측 하단 ▾]                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─── 알림 채널 설정 ────────────────────────────────────────────┐  │
│  │  새 문의 접수 시 알림 수신:                                     │  │
│  │  ☑ 카카오 알림톡 / [INP: 010-XXXX-XXXX  ]  [인증]             │  │
│  │  ☑ SMS (대체 발송)                                            │  │
│  │  ☐ 이메일 / [INP: admin@hospital.com     ]                    │  │
│  │                                                              │  │
│  │  알림 발송 테스트: [테스트 알림 발송]                           │  │
│  │  이번 달 발송 현황: 47건 / 100건 (STANDARD 플랜)               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  [취소]                                    [설정 저장]              │
└────────────────────────────────────────────────────────────────────┘
```

**"연결 테스트" 동작:**
- URL 형식 검증 (정규식)
- `HEAD` 요청으로 URL 유효성 확인 (타임아웃 3초)
- 인스타그램은 공식 API(oAuth 연동 시) 팔로워 수 표시 가능, 기본은 URL 유효성만 확인

---

### AD-04: 문의/예약 데이터 관리

**URL:** `/admin/inquiries`  
**접근 권한:** TENANT_ADMIN

```
┌────────────────────────────────────────────────────────────────────┐
│  문의 / 예약 관리                         [엑셀 내보내기] [새로고침] │
├──────────────────────────────────────────────────────────────────┤
│  필터:                                                             │
│  [DRP: 기간 선택 ▾] [DRP: 문의 유형 ▾] [DRP: 처리 상태 ▾] [검색]   │
│   2026.05.01~05.24    전체              전체              [INP: 이름]│
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  총 47건 (대기: 3건 🔴, 확인중: 4건 🟡, 완료: 40건 ✅)              │
│                                                                    │
│  ┌─────┬─────────┬──────────┬───────────┬──────────┬───────┬────┐ │
│  │  #  │ 유형    │ 이름/업체 │ 연락처     │ 접수일시  │ 상태  │ 상세│ │
│  ├─────┼─────────┼──────────┼───────────┼──────────┼───────┼────┤ │
│  │ 47  │ 📋 진료  │ 홍길동   │ 010-1234  │ 05/24    │[DRP▾] │[보기]│ │
│  │     │         │          │ -5678     │ 14:23    │🔴대기  │    │ │
│  ├─────┼─────────┼──────────┼───────────┼──────────┼───────┼────┤ │
│  │ 46  │ 📅 예약  │ 이영희   │ 010-9876  │ 05/24    │[DRP▾] │[보기]│ │
│  │     │         │          │ -5432     │ 11:05    │🔴대기  │    │ │
│  ├─────┼─────────┼──────────┼───────────┼──────────┼───────┼────┤ │
│  │ 45  │ 💼 제휴  │ (주)헬스  │ 02-123    │ 05/23    │[DRP▾] │[보기]│ │
│  │     │         │ 케어      │ -4567     │ 16:40    │🟡확인중│    │ │
│  └─────┴─────────┴──────────┴───────────┴──────────┴───────┴────┘ │
│                                                                    │
│  [이전] [1] [2] [3] ... [5] [다음]           페이지당: [DRP: 20▾] │
└────────────────────────────────────────────────────────────────────┘
```

**상세보기 모달 (AD-04-M):**

```
┌────────────────────────────────────────────────────────────────────┐
│  문의 상세 #47                                           [×] 닫기  │
├──────────────────────────────────────────────────────────────────┤
│  접수일시: 2026-05-24 14:23:11                                     │
│  문의 유형: 진료 문의                  처리 상태: [DRP: 대기 ▾]      │
│                                                                    │
│  ┌─── 문의자 정보 ──────────────────────────────────────────────┐  │
│  │  이름: 홍길동                                                │  │
│  │  연락처: 010-1234-5678              [클립보드 복사]            │  │
│  │  이메일: hong@email.com (선택 입력)                           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─── 문의 내용 ──────────────────────────────────────────────┐    │
│  │  허리 통증이 3주째 지속되고 있습니다. MRI 촬영 없이도        │    │
│  │  진료가 가능한지 궁금합니다. 평일 오전에 예약 가능할까요?    │    │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─── 관리자 메모 ──────────────────────────────────────────────┐  │
│  │  [TEXTAREA: 내부 메모를 입력하세요 (고객에게 노출 안 됨)]     │  │
│  │                                                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  [삭제]                              [저장]  [알림톡으로 답장 →]    │
└────────────────────────────────────────────────────────────────────┘
```

---

### AD-05: SEO 설정 마법사

**URL:** `/admin/seo`  
**접근 권한:** TENANT_ADMIN (BASIC: 제한 기능)

```
┌────────────────────────────────────────────────────────────────────┐
│  SEO 설정 마법사   🔍 네이버·구글 검색 노출을 직접 관리하세요.        │
├──────────────────────────────────────────────────────────────────┤
│  [TAB: 기본 SEO] [TAB: 소셜 미리보기] [TAB: 사이트맵] [TAB: 분석]   │
│                                                                    │
│  ┌─── 기본 SEO 설정 ─────────────────────────────────────────────┐  │
│  │                                                              │  │
│  │  페이지 제목 (Title Tag) *                                    │  │
│  │  [INP: 강남 통증의학과 OO의원 - 비수술 관절·척추 치료    ]     │  │
│  │  검색결과에 표시되는 제목입니다.          38/60자 ✅           │  │
│  │                                                              │  │
│  │  메타 설명 (Meta Description)                                 │  │
│  │  [TEXTAREA: 강남역 2번 출구 도보 3분. 비수술적 치료로        │  │
│  │   허리·무릎·어깨 통증을 해결합니다. 초진 예약 문의.    ]       │  │
│  │  검색결과 제목 아래에 표시됩니다.         62/160자 ✅          │  │
│  │                                                              │  │
│  │  대표 키워드 (최대 5개)                                       │  │
│  │  [강남 통증의학과] [×]  [허리 비수술] [×]  [관절 치료] [×]   │  │
│  │  [+ 키워드 추가]                                              │  │
│  │                                                              │  │
│  │  검색결과 미리보기:                                           │  │
│  │  ┌───────────────────────────────────────────────────────┐  │  │
│  │  │  강남 통증의학과 OO의원 - 비수술 관절·척추 치료          │  │  │
│  │  │  https://my-hospital.com                               │  │  │
│  │  │  강남역 2번 출구 도보 3분. 비수술적 치료로 허리·무릎·   │  │  │
│  │  │  어깨 통증을 해결합니다. 초진 예약 문의.                │  │  │
│  │  └───────────────────────────────────────────────────────┘  │  │
│  │                                                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  [설정 저장]                    [구글 서치 콘솔에 수동 제출하기 ↗]    │
└────────────────────────────────────────────────────────────────────┘
```

---

## 5. API 기술 스펙

### 5.1 API 공통 규격

**Base URL:** `https://api.cms-admin.com/v1`

**공통 요청 헤더:**

```
Authorization: Bearer {jwt_access_token}
Content-Type: application/json
X-Tenant-ID: {tenant_uuid}          ← 검증용 (JWT에도 포함)
Accept-Language: ko-KR
```

**공통 응답 형식:**

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-05-24T14:23:00Z",
    "version": "1.0"
  }
}
```

**공통 에러 응답:**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "메인 타이틀은 40자를 초과할 수 없습니다.",
    "field": "main_title",
    "details": []
  }
}
```

**에러 코드 정의:**

| HTTP Status | Error Code | 설명 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 입력값 검증 실패 |
| 401 | `UNAUTHORIZED` | 토큰 없음 또는 만료 |
| 403 | `FORBIDDEN` | 권한 없음 (다른 테넌트 접근 시도) |
| 404 | `NOT_FOUND` | 리소스 없음 |
| 409 | `CONFLICT` | 중복 데이터 |
| 413 | `FILE_TOO_LARGE` | 업로드 파일 초과 (20MB) |
| 422 | `PLAN_LIMIT_EXCEEDED` | 요금제 한도 초과 |
| 429 | `RATE_LIMIT_EXCEEDED` | API 호출 한도 초과 |
| 500 | `INTERNAL_ERROR` | 서버 내부 오류 |

---

### 5.2 인증 API

#### POST /auth/login
관리자 로그인

**Request:**
```json
{
  "email": "admin@hospital.com",
  "password": "hashed_or_plain",
  "tenant_slug": "oo-hospital"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiJ9...",
    "token_type": "Bearer",
    "expires_in": 900,
    "user": {
      "id": "usr_uuid",
      "email": "admin@hospital.com",
      "role": "TENANT_ADMIN",
      "tenant_id": "ten_uuid",
      "tenant_name": "OO의원"
    }
  }
}
```
※ Refresh Token은 HttpOnly Cookie로 별도 발급

#### POST /auth/refresh
Access Token 갱신. Refresh Token은 Cookie에서 자동 추출.

**Response 200:** access_token 새로 발급

#### POST /auth/logout
Refresh Token 쿠키 삭제 + Redis 블랙리스트 등록

---

### 5.3 섹션/콘텐츠 API

#### GET /sections
현재 테넌트의 섹션 목록 조회

**Response 200:**
```json
{
  "success": true,
  "data": {
    "sections": [
      {
        "id": "sec_uuid_1",
        "type": "HERO_BANNER",
        "label": "메인 비주얼",
        "order": 1,
        "is_active": true,
        "settings": {
          "main_title": "강남 최고의 통증의학과, OO의원",
          "sub_copy": "비수술적 치료로 당신의 관절 건강을 지킵니다.",
          "bg_image_url": "https://cdn.cms.com/ten_uuid/hero/main_v3.webp",
          "cta_text": "온라인 상담하기",
          "cta_url": "/contact",
          "cta_target": "_self"
        }
      },
      {
        "id": "sec_uuid_2",
        "type": "INTRO",
        "label": "병원 소개",
        "order": 2,
        "is_active": true,
        "settings": { ... }
      }
    ]
  }
}
```

#### PATCH /sections/:id
섹션 설정 수정 (부분 업데이트)

**Request:**
```json
{
  "main_title": "새로운 타이틀",
  "cta_text": "지금 상담하기"
}
```

**Validation Rules:**
| 필드 | 최대 길이 | 필수 여부 | 비고 |
|---|---|---|---|
| main_title | 40자 | Y | 공백 포함 |
| sub_copy | 80자 | N | |
| cta_text | 20자 | N | |
| cta_url | 200자 | N | `/`로 시작하거나 `https://`로 시작해야 함 |

**Response 200:**
```json
{
  "success": true,
  "data": { "updated_section": { ... } }
}
```

#### PATCH /sections/order
섹션 순서 일괄 변경

**Request:**
```json
{
  "order": [
    { "id": "sec_uuid_1", "order": 1 },
    { "id": "sec_uuid_3", "order": 2 },
    { "id": "sec_uuid_2", "order": 3 }
  ]
}
```

#### PATCH /sections/:id/toggle
섹션 활성화/비활성화

**Request:**
```json
{ "is_active": false }
```

---

### 5.4 파일 업로드 API

#### POST /upload/image
이미지 업로드 및 자동 최적화

**Request:** `multipart/form-data`
| 필드 | 타입 | 설명 |
|---|---|---|
| file | File | 이미지 파일 (JPG/PNG/WebP/GIF) |
| context | string | 사용 위치 (`hero`, `gallery`, `intro`) |
| section_id | string | 연결할 섹션 ID |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "url": "https://cdn.cms.com/ten_uuid/hero/uuid.webp",
    "original_size_kb": 8192,
    "optimized_size_kb": 340,
    "width": 1920,
    "height": 1080,
    "format": "webp"
  }
}
```

**처리 파이프라인:**
```
multipart → FastAPI UploadFile → Pillow 최적화 처리 → MinIO 업로드 → DB 기록 → CDN URL 반환
```

**Pillow 이미지 처리 설정:**
```python
# app/services/image.py
from PIL import Image
import io

def optimize_image(file_bytes: bytes) -> tuple[bytes, dict]:
    """이미지 최적화: 리사이즈 + WebP 변환"""
    original_size = len(file_bytes)

    with Image.open(io.BytesIO(file_bytes)) as img:
        # EXIF 기반 회전 보정
        img = ImageOps.exif_transpose(img)

        # RGBA → RGB 변환 (WebP 투명도 이슈 방지)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")

        # 비율 유지, 최대 1920px (원본보다 확대 금지)
        img.thumbnail((1920, 1920), Image.LANCZOS)

        # WebP 변환 (quality 82 = 용량/품질 최적 균형)
        output = io.BytesIO()
        img.save(output, format="WEBP", quality=82, optimize=True)
        optimized_bytes = output.getvalue()

    return optimized_bytes, {
        "original_size": original_size,
        "optimized_size": len(optimized_bytes),
        "width": img.width,
        "height": img.height,
        "format": "webp"
    }
```

---

### 5.5 문의 API

#### GET /inquiries
문의 목록 조회 (페이지네이션)

**Query Parameters:**
| 파라미터 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| page | integer | 1 | 페이지 번호 |
| limit | integer | 20 | 페이지당 개수 (최대 100) |
| status | string | all | `PENDING`, `IN_PROGRESS`, `DONE` |
| type | string | all | `CONSULT`, `RESERVATION`, `PARTNERSHIP`, `GENERAL` |
| from_date | date | - | YYYY-MM-DD |
| to_date | date | - | YYYY-MM-DD |
| keyword | string | - | 이름/업체명 검색 |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "total": 47,
    "page": 1,
    "limit": 20,
    "items": [
      {
        "id": "inq_uuid",
        "type": "CONSULT",
        "name": "홍길동",
        "phone": "010-1234-5678",
        "email": "hong@email.com",
        "message": "허리 통증이 3주째...",
        "status": "PENDING",
        "admin_memo": null,
        "created_at": "2026-05-24T14:23:11Z",
        "updated_at": "2026-05-24T14:23:11Z"
      }
    ]
  }
}
```

#### PATCH /inquiries/:id
문의 상태 변경 및 메모 저장

**Request:**
```json
{
  "status": "IN_PROGRESS",
  "admin_memo": "5/25 오전에 콜백 예정"
}
```

#### POST /inquiries (Public API - 인증 불필요)
홈페이지에서 고객 문의 제출

**Request:**
```json
{
  "tenant_id": "ten_uuid",
  "type": "CONSULT",
  "name": "홍길동",
  "phone": "010-1234-5678",
  "email": "hong@email.com",
  "message": "허리 통증 관련 문의드립니다."
}
```

**Validation:**
- phone: 한국 휴대폰 번호 정규식 `^01[016789]-?\d{3,4}-?\d{4}$`
- message: 최대 1,000자
- 스팸 방지: reCAPTCHA v3 (score ≥ 0.5) + IP 기준 1분 3회 제한

**Response 200:**
```json
{
  "success": true,
  "data": { "inquiry_id": "inq_uuid", "message": "문의가 접수되었습니다." }
}
```

**문의 접수 후 사이드 이펙트:**
1. DB INSERT
2. 테넌트 알림 설정 확인
3. 알림톡/SMS 발송 트리거 (비동기 큐)
4. SSE로 관리자 대시보드에 실시간 알림

---

### 5.6 SNS 설정 API

#### GET /sns-settings
현재 SNS 연동 설정 조회

#### PUT /sns-settings
SNS 설정 전체 저장

**Request:**
```json
{
  "channels": [
    {
      "type": "INSTAGRAM",
      "url": "https://instagram.com/my_hospital",
      "is_active": true,
      "show_in_footer": true,
      "show_as_floating": false
    },
    {
      "type": "KAKAO",
      "url": "https://pf.kakao.com/_xAbCdE",
      "is_active": true,
      "show_in_footer": true,
      "show_as_floating": true
    }
  ],
  "notification": {
    "kakao_phone": "010-1234-5678",
    "sms_phone": "010-1234-5678",
    "email": "admin@hospital.com",
    "use_kakao": true,
    "use_sms": true,
    "use_email": false
  }
}
```

#### POST /sns-settings/test-url
URL 유효성 테스트

**Request:** `{ "url": "https://instagram.com/my_hospital" }`  
**Response:** `{ "valid": true, "status_code": 200, "response_time_ms": 234 }`

---

### 5.7 SEO API

#### GET /seo-settings

#### PUT /seo-settings
**Request:**
```json
{
  "page_title": "강남 통증의학과 OO의원 - 비수술 관절·척추 치료",
  "meta_description": "강남역 2번 출구 도보 3분...",
  "keywords": ["강남 통증의학과", "허리 비수술", "관절 치료"],
  "og_title": "OO의원",
  "og_description": "...",
  "og_image_url": "https://...",
  "robots": "index,follow",
  "canonical_url": "https://my-hospital.com"
}
```

---

## 6. 데이터베이스 스키마 설계

**DBMS:** PostgreSQL 17  
**Encoding:** UTF-8  
**Timezone:** Asia/Seoul  
**명명 규칙:** snake_case, 복수형 테이블명

### 6.1 ERD 개요

```
tenants (1) ──< users (N)
tenants (1) ──< sections (N)
tenants (1) ──< site_settings (N)     ← Key-Value 설정 저장소
tenants (1) ──< sns_channel_settings (N)
tenants (1) ──< inquiries (N)
tenants (1) ──< site_analytics (N)
tenants (1) ──< notification_settings (1)
tenants (1) ──< seo_settings (1)
inquiries (1) ──< inquiry_attachments (N)
```

---

### 6.2 핵심 테이블 DDL

#### tenants (테넌트 마스터)

```sql
CREATE TABLE tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            VARCHAR(100) UNIQUE NOT NULL,  -- URL 식별자 (예: oo-hospital)
  name            VARCHAR(200) NOT NULL,
  template_type   VARCHAR(20) NOT NULL
                  CHECK (template_type IN ('HOSPITAL','PENSION','STARTUP','GENERAL')),
  plan_type       VARCHAR(20) NOT NULL DEFAULT 'BASIC'
                  CHECK (plan_type IN ('BASIC','STANDARD','PREMIUM')),
  plan_expires_at TIMESTAMPTZ,
  custom_domain   VARCHAR(255),                  -- 연결된 커스텀 도메인
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_is_active ON tenants(is_active);
```

#### users (관리자 계정)

```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email           VARCHAR(255) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,         -- bcrypt, rounds=12
  role            VARCHAR(20) NOT NULL DEFAULT 'TENANT_ADMIN'
                  CHECK (role IN ('SUPER_ADMIN','TENANT_ADMIN','TENANT_VIEWER')),
  last_login_at   TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, email)
);

CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);

-- RLS 적용
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_tenant_isolation ON users
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
         OR current_setting('app.is_super_admin', true) = 'true');
```

#### sections (섹션 정의)

```sql
CREATE TABLE sections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  section_type    VARCHAR(50) NOT NULL,
                  -- HERO_BANNER, INTRO, SERVICES, GALLERY,
                  -- RESERVATION, CONTACT, MAP, PORTFOLIO, TEAM, FAQ
  label           VARCHAR(100) NOT NULL,          -- 관리자 표시명
  display_order   SMALLINT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sections_tenant_order ON sections(tenant_id, display_order);

ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY sections_tenant_isolation ON sections
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
```

#### section_settings (섹션 콘텐츠 - Key-Value)

```sql
CREATE TABLE section_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id      UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  setting_key     VARCHAR(100) NOT NULL,
  setting_value   TEXT,
  value_type      VARCHAR(20) NOT NULL DEFAULT 'STRING'
                  CHECK (value_type IN ('STRING','INTEGER','BOOLEAN','JSON','URL')),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (section_id, setting_key)
);

CREATE INDEX idx_section_settings_section ON section_settings(section_id);

ALTER TABLE section_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY section_settings_tenant_isolation ON section_settings
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
```

**section_settings 데이터 예시 (HERO_BANNER):**

| section_id | setting_key | setting_value | value_type |
|---|---|---|---|
| sec_uuid | main_title | 강남 최고의 통증의학과 | STRING |
| sec_uuid | sub_copy | 비수술적 치료로... | STRING |
| sec_uuid | bg_image_url | https://cdn.../hero.webp | URL |
| sec_uuid | cta_text | 온라인 상담하기 | STRING |
| sec_uuid | cta_url | /contact | STRING |
| sec_uuid | cta_target | _self | STRING |

#### inquiries (문의 데이터)

```sql
CREATE TABLE inquiries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type            VARCHAR(30) NOT NULL DEFAULT 'GENERAL'
                  CHECK (type IN ('CONSULT','RESERVATION','PARTNERSHIP','GENERAL')),
  status          VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','IN_PROGRESS','DONE','SPAM')),
  name            VARCHAR(100) NOT NULL,
  phone           VARCHAR(20) NOT NULL,
  email           VARCHAR(255),
  message         TEXT NOT NULL,
  admin_memo      TEXT,
  ip_address      INET,                           -- 스팸 감지용
  user_agent      TEXT,
  is_notified     BOOLEAN NOT NULL DEFAULT false, -- 알림 발송 여부
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inquiries_tenant_status ON inquiries(tenant_id, status);
CREATE INDEX idx_inquiries_tenant_created ON inquiries(tenant_id, created_at DESC);
CREATE INDEX idx_inquiries_ip ON inquiries(ip_address, created_at);

ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY inquiries_tenant_isolation ON inquiries
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
```

#### sns_channel_settings (SNS 연동)

```sql
CREATE TABLE sns_channel_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_type    VARCHAR(30) NOT NULL
                  CHECK (channel_type IN (
                    'INSTAGRAM','NAVER_BLOG','KAKAO','YOUTUBE',
                    'FACEBOOK','TIKTOK','TWITTER'
                  )),
  url             VARCHAR(500),
  is_active       BOOLEAN NOT NULL DEFAULT false,
  show_in_footer  BOOLEAN NOT NULL DEFAULT true,
  show_as_floating BOOLEAN NOT NULL DEFAULT false,
  display_order   SMALLINT NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, channel_type)
);

ALTER TABLE sns_channel_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY sns_settings_tenant_isolation ON sns_channel_settings
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
```

#### notification_settings (알림 설정)

```sql
CREATE TABLE notification_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID UNIQUE NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  use_kakao       BOOLEAN NOT NULL DEFAULT false,
  kakao_phone     VARCHAR(20),
  use_sms         BOOLEAN NOT NULL DEFAULT false,
  sms_phone       VARCHAR(20),
  use_email       BOOLEAN NOT NULL DEFAULT false,
  notification_email VARCHAR(255),
  monthly_kakao_count INTEGER NOT NULL DEFAULT 0,  -- 이번 달 발송 수
  monthly_reset_at DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### seo_settings (SEO 메타 설정)

```sql
CREATE TABLE seo_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID UNIQUE NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  page_title      VARCHAR(60),
  meta_description VARCHAR(160),
  keywords        VARCHAR(500)[],                 -- 배열 타입
  og_title        VARCHAR(60),
  og_description  VARCHAR(200),
  og_image_url    VARCHAR(500),
  robots          VARCHAR(50) DEFAULT 'index,follow',
  canonical_url   VARCHAR(500),
  google_site_verification VARCHAR(100),
  naver_site_verification  VARCHAR(100),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### site_analytics (방문 통계)

```sql
CREATE TABLE site_analytics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  page_views      INTEGER NOT NULL DEFAULT 0,
  unique_visitors INTEGER NOT NULL DEFAULT 0,
  mobile_ratio    DECIMAL(5,2),                   -- 모바일 비율 %
  top_referrer    VARCHAR(255),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, date)
);

CREATE INDEX idx_analytics_tenant_date ON site_analytics(tenant_id, date DESC);
```

#### uploaded_files (파일 메타데이터)

```sql
CREATE TABLE uploaded_files (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  section_id      UUID REFERENCES sections(id),
  original_name   VARCHAR(255) NOT NULL,
  stored_path     VARCHAR(500) NOT NULL,          -- MinIO/S3 경로
  cdn_url         VARCHAR(500) NOT NULL,
  mime_type       VARCHAR(50) NOT NULL,
  original_size   INTEGER NOT NULL,               -- bytes
  optimized_size  INTEGER,                        -- bytes (WebP 변환 후)
  width           SMALLINT,
  height          SMALLINT,
  context         VARCHAR(50),                    -- hero, gallery, intro 등
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 스토리지 사용량 조회용
CREATE INDEX idx_files_tenant ON uploaded_files(tenant_id);
```

### 6.3 데이터 보관 정책

| 데이터 | BASIC | STANDARD | PREMIUM | 비고 |
|---|---|---|---|---|
| 문의 데이터 | 30일 후 삭제 | 180일 후 삭제 | 영구 보관 | 배치 job 매일 02:00 실행 |
| 업로드 파일 | 1GB 한도 | 5GB 한도 | 20GB 한도 | 초과 시 업로드 차단 |
| 방문 통계 | 3개월 | 12개월 | 36개월 | |

---

## 7. 핵심 기능 상세 구현 가이드

### 7.1 카카오 알림톡 발송

**사전 조건:**
- 카카오 비즈니스 채널 개설 (카카오 파트너스 가입 필요)
- 알림톡 템플릿 심사 완료 (심사 기간 3~7 영업일)
- 네이버 클라우드 Simple & Easy Notification Service (SENS) API 사용 권장

**알림톡 템플릿 (심사 제출용):**
```
[#{사이트명}] 새 문의 접수 알림

#{이름} 고객님께서 #{문의유형} 문의를 남겨주셨습니다.

📞 연락처: #{연락처}
🕐 접수시각: #{접수시각}

[관리자 페이지에서 확인하기]
```

**발송 로직 (비동기 큐):**

```python
# app/workers/notification.py  (Celery 태스크)
from celery import shared_task
from app.services.notification import NotificationService
from app.db.session import get_sync_session

@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=2,  # 초 (지수 백오프: 2, 4, 8초)
    autoretry_for=(Exception,),
    retry_backoff=True
)
def send_inquiry_alert(self, tenant_id: str, inquiry_id: str):
    """문의 접수 알림 비동기 발송 태스크"""
    with get_sync_session() as db:
        service = NotificationService(db)
        settings = service.get_notification_settings(tenant_id)
        inquiry  = service.get_inquiry(inquiry_id)

        # 플랜별 월 발송 한도 확인
        service.check_monthly_limit(tenant_id, settings)

        kakao_success = False
        if settings.use_kakao and settings.kakao_phone:
            kakao_success = service.send_kakao_alimtalk(
                to=settings.kakao_phone,
                template_code="INQUIRY_ALERT_V1",
                variables={
                    "사이트명": settings.tenant_name,
                    "이름": inquiry.name,
                    "문의유형": service.translate_type(inquiry.type),
                    "연락처": service.mask_phone(inquiry.phone),  # 010-****-5678
                    "접수시각": service.format_kr_time(inquiry.created_at),
                }
            )
            if kakao_success:
                service.increment_monthly_count(tenant_id)

        # 카카오 실패 시 SMS 대체 발송
        if settings.use_sms and not kakao_success:
            service.send_sms(
                to=settings.sms_phone,
                message=f"[{settings.tenant_name}] 새 문의: {inquiry.name} ({inquiry.phone})"
            )

        service.mark_notified(inquiry_id)


# app/api/routers/inquiries.py  (문의 접수 엔드포인트)
@router.post("/", status_code=201)
async def create_inquiry(body: InquiryCreate, tenant_id: str):
    inquiry = await inquiry_service.create(tenant_id, body)

    # Celery 비동기 큐에 알림 태스크 추가 (논블로킹)
    send_inquiry_alert.apply_async(
        args=[str(tenant_id), str(inquiry.id)],
        countdown=0  # 즉시 실행
    )

    # Redis Pub/Sub으로 SSE 실시간 알림 전송
    await redis.publish(
        f"tenant:{tenant_id}:new_inquiry",
        json.dumps({"type": "NEW_INQUIRY", "inquiry_id": str(inquiry.id)})
    )

    return {"inquiry_id": str(inquiry.id), "message": "문의가 접수되었습니다."}
```

### 7.2 섹션 순서 변경 (낙관적 업데이트)

```javascript
// React 컴포넌트 (DnD Kit 사용)
const SectionList = () => {
  const [sections, setSections] = useState(initialSections);

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (active.id === over.id) return;

    // 1. UI 즉시 업데이트 (낙관적)
    const oldIndex = sections.findIndex(s => s.id === active.id);
    const newIndex = sections.findIndex(s => s.id === over.id);
    const reordered = arrayMove(sections, oldIndex, newIndex);
    setSections(reordered);

    // 2. API 비동기 저장
    try {
      await api.patch('/sections/order', {
        order: reordered.map((s, idx) => ({ id: s.id, order: idx + 1 }))
      });
      toast.success('순서가 저장되었습니다.');
    } catch (err) {
      // 3. 실패 시 원래 순서로 롤백
      setSections(sections);
      toast.error('순서 저장에 실패했습니다. 다시 시도해주세요.');
    }
  };
  
  // ... DndContext, SortableContext 렌더링
};
```

### 7.3 실시간 문의 알림 (SSE)

```python
# app/api/routers/notifications.py
import asyncio, json
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from app.core.redis import get_redis
from app.core.auth import get_current_user

router = APIRouter()

@router.get("/stream")
async def notification_stream(
    current_user = Depends(get_current_user),
    redis = Depends(get_redis)
):
    """SSE: 실시간 문의 알림 스트림"""
    tenant_id = str(current_user.tenant_id)
    channel   = f"tenant:{tenant_id}:new_inquiry"

    async def event_generator():
        pubsub = redis.pubsub()
        await pubsub.subscribe(channel)
        try:
            while True:
                # Redis 메시지 폴링
                message = await pubsub.get_message(ignore_subscribe_messages=True)
                if message:
                    yield f"data: {message['data'].decode()}

"

                # 30초마다 heartbeat (Nginx 커넥션 타임아웃 방지)
                await asyncio.sleep(0.5)
                yield ": heartbeat

"

        except asyncio.CancelledError:
            # 클라이언트 연결 종료 시 구독 해제
            await pubsub.unsubscribe(channel)
            await pubsub.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # Nginx 버퍼링 비활성화
        }
    )
```

---

## 8. 비기능 요구사항 (NFR)

### 8.1 성능 목표

| 항목 | 목표값 | 측정 방법 |
|---|---|---|
| 관리자 페이지 초기 로드 | ≤ 2초 (LCP) | Lighthouse |
| API 응답 시간 (P95) | ≤ 300ms | APM 모니터링 |
| 이미지 최적화 처리 | ≤ 5초 (20MB 기준) | 서버 로그 |
| 알림톡 발송 지연 | ≤ 30초 (문의 접수 후) | 큐 모니터링 |
| 동시 접속 테넌트 | ≥ 500 | 부하 테스트 |

### 8.2 보안 요구사항

| 항목 | 요구사항 |
|---|---|
| 비밀번호 저장 | bcrypt rounds=12 |
| SQL Injection | Parameterized Query 필수 (ORM 사용 권장) |
| XSS | 모든 사용자 입력 Sanitize (DOMPurify) |
| CSRF | SameSite=Strict Cookie + CORS origin 화이트리스트 |
| 파일 업로드 | MIME 타입 검증 (magic bytes 기반) + 확장자 검증 |
| Rate Limiting | IP당 API 100req/min, 업로드 10req/min |
| 민감 정보 | 연락처 로그 마스킹 (`010-****-5678`) |
| HTTPS | 전 구간 강제 (HSTS 적용) |

### 8.3 가용성 및 장애 대응

- **목표 가용성:** 99.5% (월 3.6시간 허용 다운타임)
- **데이터 백업:** PostgreSQL WAL + 일 1회 전체 스냅샷 → S3 보관 (30일)
- **장애 대응:** 알림톡 발송 실패 시 SMS 자동 대체 발송
- **CDN:** 이미지는 CloudFront/Cloudflare 통해 전세계 배포, 원본 서버 부하 감소

---

## 9. 개발 환경 및 기술 스택

### 9.1 기술 스택 상세

> **검증 기준:** 정식(stable) 릴리즈 버전 + React 19 호환 확인 완료 기준으로 선정 (2026-05-24 기준)

#### 프론트엔드 (모노레포: pnpm workspaces)

| 앱/패키지 | 기술 | 버전 | 포트 | React 19 호환 | 선택 이유 |
|---|---|---|---|---|---|
| **apps/admin** (관리자) | React | **19.x** | 3001 | ✅ 정식 | SPA로 충분, 빠른 개발 |
| | Vite | **7.x** | | ✅ | 최신 빌드 툴, HMR 최적화 |
| | TypeScript | **5.9.x** | | ✅ | 최신 안정 버전 |
| | TailwindCSS | **4.x** | | ✅ | Vite 플러그인 통합, 설정 대폭 간소화 |
| | **@dnd-kit/react** | **0.4.x** | | ⚠️ | 유일한 예외: 0.x지만 React 19 대응 공식 버전. `--legacy-peer-deps` 설치 |
| | TanStack Query | **5.x** | | ✅ | React 19 완전 호환 확인 |
| | Zustand | **5.x** | | ✅ | React 19 peer dependency 공식 지원 |
| **apps/client** (고객 홈) | Next.js | **15.x** | 3000 | ✅ | React 19 기본 탑재, SSR/SEO 필수 |
| | TypeScript | **5.9.x** | | ✅ | |
| | TailwindCSS | **4.x** | | ✅ | |
| **packages/ui** | React 공통 컴포넌트 | - | - | ✅ | 어드민·클라이언트 공유 |
| **packages/types** | TypeScript 인터페이스 | - | - | ✅ | API 타입 프론트-백 공유 |

> **⚠️ @dnd-kit/react 설치 방법:**
> ```bash
> pnpm add @dnd-kit/react @dnd-kit/helpers --legacy-peer-deps
> ```
> 0.x 버전이지만 현재 React 19 대응 유일한 공식 옵션. API 변경 가능성이 있으므로 버전 고정 권장.
> 대안: 섹션 순서 변경이 단순 리스트 정렬이므로 `mousedown` + 상태 배열 교체로 직접 구현도 고려 가능.

#### 백엔드 (Python)

| 계층 | 기술 | 버전 | 선택 이유 |
|---|---|---|---|
| **웹 프레임워크** | FastAPI | **0.115.x** | 자동 OpenAPI 문서, async 네이티브, Pydantic v2 통합 |
| **데이터 검증** | Pydantic | **2.x** | 요청/응답 타입 검증, 직렬화, 성능 개선 |
| **ORM** | SQLAlchemy | **2.x** | 성숙한 생태계, async 지원, RLS 호환 |
| **DB 마이그레이션** | Alembic | **1.x** | SQLAlchemy 공식 마이그레이션 툴 |
| **비동기 작업 큐** | Celery | **5.x** | 알림톡/AI 작업 비동기 처리, Redis 브로커 |
| **이미지 최적화** | Pillow | **11.x** | WebP 변환, 리사이즈, 최신 안정 버전 |
| **AI 연동** | LangChain / OpenAI SDK | **최신** | AI Manager 코드베이스 공유 |
| **런타임** | Python | **3.13** | 최신 안정 버전, 성능 개선 |
| **패키지 관리** | Poetry | **2.x** | 의존성 고정, 가상환경 통합 |
| **ASGI 서버** | Uvicorn + Gunicorn | **최신** | 프로덕션 멀티워커 배포 |

#### 인프라 / 데이터베이스 / 모니터링

| 계층 | 기술 | 버전 | 선택 이유 |
|---|---|---|---|
| **데이터베이스** | PostgreSQL | **17** | 최신 안정, RLS·JSONB·UUID 기본 지원 |
| **캐시/큐/PubSub** | Redis | **8.x** | Celery 브로커 + SSE Pub/Sub + 세션 캐시 |
| **스토리지** | MinIO / AWS S3 | **최신** | S3 호환, 자체 호스팅 가능 |
| **컨테이너** | Docker + Docker Compose | **최신** | 개발 환경 통합 |
| **프로덕션 배포** | AWS ECS / Fargate | | 컨테이너 오케스트레이션 |
| **API Gateway** | Nginx | **1.28** | SSL, 라우팅, Rate Limiting |
| **에러 추적** | Sentry | **최신** | Python + JS 통합 지원 |
| **메트릭** | Grafana + Prometheus | **최신** | 서버/API 모니터링 |

### 9.2 개발 환경 설정

**모노레포 디렉토리 구조:**

```
cms-project/
├── apps/
│   ├── admin/               ← React 18 + Vite (관리자 페이지)
│   │   ├── src/
│   │   ├── vite.config.ts
│   │   └── package.json
│   ├── client/              ← Next.js 15 (고객 홈페이지)
│   │   ├── app/
│   │   ├── next.config.ts
│   │   └── package.json
│   └── backend/             ← FastAPI (Python)
│       ├── app/
│       │   ├── api/         ← 라우터 (routers/)
│       │   ├── models/      ← SQLAlchemy 모델
│       │   ├── schemas/     ← Pydantic 스키마
│       │   ├── services/    ← 비즈니스 로직
│       │   ├── workers/     ← Celery 태스크
│       │   └── main.py
│       ├── alembic/         ← DB 마이그레이션
│       ├── pyproject.toml   ← Poetry 의존성
│       └── Dockerfile
├── packages/
│   ├── ui/                  ← 공통 React 컴포넌트
│   └── types/               ← 공통 TypeScript 타입
├── docker-compose.yml
└── pnpm-workspace.yaml
```

**로컬 개발 환경 초기 설정:**

```bash
# 전제 조건: Docker, Node.js 22.x (모노레포 프론트 빌드용), pnpm, Python 3.13, Poetry 2.x

# 1. 저장소 클론
git clone https://github.com/company/cms-project.git
cd cms-project

# 2. 프론트엔드 의존성 설치 (모노레포 전체)
pnpm install

# 3. 백엔드 의존성 설치
cd apps/backend
poetry install
cd ../..

# 4. 환경변수 설정
cp apps/backend/.env.example apps/backend/.env
cp apps/admin/.env.example apps/admin/.env.local
cp apps/client/.env.example apps/client/.env.local

# 5. 인프라 실행 (PostgreSQL, Redis, MinIO)
docker compose up -d postgres redis minio

# 6. DB 마이그레이션 및 초기 데이터 시드
cd apps/backend
poetry run alembic upgrade head
poetry run python scripts/seed.py
cd ../..

# 7. 개발 서버 전체 실행
# 터미널 1: 백엔드
cd apps/backend && poetry run uvicorn app.main:app --reload --port 8000

# 터미널 2: 관리자 프론트
cd apps/admin && pnpm dev          # :3001

# 터미널 3: 고객 홈페이지
cd apps/client && pnpm dev         # :3000

# 터미널 4: Celery 워커 (알림/AI 작업)
cd apps/backend && poetry run celery -A app.workers worker --loglevel=info
```

### 9.3 환경변수 목록

**apps/backend/.env:**

```env
# 서버
ENVIRONMENT=development
BACKEND_PORT=8000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# 데이터베이스
DATABASE_URL=postgresql+asyncpg://cms_user:password@localhost:5432/cms_db
DATABASE_URL_SYNC=postgresql://cms_user:password@localhost:5432/cms_db  # Alembic용

# Redis
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/2

# JWT
JWT_SECRET=your-super-secret-key-min-32chars
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# MinIO / S3
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=cms-media
MINIO_SECURE=false
CDN_BASE_URL=http://localhost:9000/cms-media

# 카카오 알림톡 (네이버 클라우드 SENS)
NCLOUD_ACCESS_KEY=your-ncloud-access-key
NCLOUD_SECRET_KEY=your-ncloud-secret-key
NCLOUD_SENS_SERVICE_ID=ncp:sms:xxx
KAKAO_CHANNEL_ID=xxx
KAKAO_TEMPLATE_CODE_INQUIRY=INQUIRY_ALERT_V1

# AI Manager 연동
OPENAI_API_KEY=sk-xxx
AI_MANAGER_BASE_URL=http://localhost:9000  # AI Manager 서비스 URL
AI_AUTO_CLASSIFY=true                      # 문의 자동 분류 활성화

# reCAPTCHA
RECAPTCHA_SECRET_KEY=your-secret-key

# Sentry
SENTRY_DSN=https://xxx@sentry.io/xxx
```

**apps/admin/.env.local:**

```env
VITE_API_BASE_URL=http://localhost:8000/api
VITE_SENTRY_DSN=https://xxx@sentry.io/xxx
```

**apps/client/.env.local:**

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8001/api
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

---

## 10. 오픈 이슈 및 결정 필요 사항

| # | 이슈 | 옵션 A | 옵션 B | 결정 기한 | 담당 |
|---|---|---|---|---|---|
| 1 | 방문자 통계 수집 방식 | 자체 수집 (Nginx 로그 파싱) | GA4 Reporting API 연동 | 1주차 | 백엔드 |
| 2 | 이미지 CDN | AWS CloudFront | Cloudflare CDN | 1주차 | 인프라 |
| 3 | 카카오 알림톡 채널 | 자체 비즈채널 개설 | 네이버 클라우드 SENS 위탁 | 즉시 | PM |
| 4 | 섹션 유형 추가 기준 | 요청 기반 추가 | 초기 고정 세트 (8종) | 2주차 | 전체 |
| 5 | 인스타그램 API 연동 | Instagram Basic Display API | URL 유효성만 확인 | 2주차 | 프론트 |
| 6 | BASIC 플랜 섹션 수 제한 | 서버에서 강제 차단 | 프론트 UI만 제한 | 1주차 | 백엔드 |


---

## 11. 템플릿 선택 시스템 (Multi-Template Architecture)

### 11.1 개념 설계

고객(테넌트 어드민)이 코드 없이 홈페이지 디자인 전체를 교체할 수 있는 시스템.
**핵심 원칙: 템플릿 전환 시 콘텐츠(텍스트·이미지)는 100% 유지, 디자인(색상·폰트·레이아웃)만 교체.**

```
템플릿 = CSS 변수 세트 + 섹션 레이아웃 구조 JSON

[템플릿 A → 템플릿 B 전환 시]
  ✅ 유지: 메인 타이틀, 서브 카피, 이미지, 문의 데이터
  🔄 교체: 색상 팔레트, 폰트 조합, 섹션 레이아웃 구조, 애니메이션 스타일
```

### 11.2 기본 제공 템플릿 목록 (업종별 초기 세트)

| 템플릿 ID | 템플릿명 | 추천 업종 | 디자인 컨셉 | 레이아웃 특징 |
|---|---|---|---|---|
| `TPL_MODERN_MINIMAL` | 모던 미니멀 | 스타트업, IT | 여백 중심, 다크/라이트 | 풀스크린 히어로 + 카드 그리드 |
| `TPL_WARM_TRUST` | 따뜻한 신뢰감 | 병원, 한의원 | 웜톤, 부드러운 곡선 | 사이드 텍스트 + 이미지 분할 |
| `TPL_NATURE_FRESH` | 자연 프레시 | 펜션, 카페, 식당 | 그린 계열, 자연 소재 | 매거진형 풀블리드 이미지 |
| `TPL_PROFESSIONAL` | 프로페셔널 | 법무사, 세무사, 컨설팅 | 네이비·골드, 격식체 | 좌측 사이드바 + 본문 |
| `TPL_VIBRANT_YOUTH` | 바이브런트 | 학원, 미용실, 피트니스 | 강렬한 원색, 역동적 | 비대칭 그리드 + 강조 타이포 |
| `TPL_CLEAN_SHOP` | 클린 쇼핑 | 소매점, 온라인몰 | 화이트 베이스, 상품 중심 | 상품 갤러리 + 플로팅 CTA |

> 초기 6종 제공, 이후 사용자 요청 기반으로 분기별 2종씩 추가 예정.

### 11.3 템플릿 데이터 구조

#### TypeScript 인터페이스 (`packages/types/template.ts`)

```typescript
export interface Template {
  id: string                          // "TPL_MODERN_MINIMAL"
  name: string                        // "모던 미니멀"
  description: string                 // 템플릿 설명
  thumbnail_url: string               // 관리자 선택 화면용 미리보기 이미지
  preview_url: string                 // 전체 미리보기 URL
  industry_tags: TemplateIndustry[]   // 추천 업종 태그
  css_variables: CSSVariableSet       // 색상·폰트 변수
  section_layout: SectionLayoutConfig // 섹션 기본 구조
  is_premium: boolean                 // STANDARD 이상 플랜 전용 여부
  created_at: string
}

export interface CSSVariableSet {
  // 색상
  color_primary: string       // "#2563eb"
  color_secondary: string     // "#64748b"
  color_accent: string        // "#f59e0b"
  color_background: string    // "#ffffff"
  color_surface: string       // "#f8fafc"
  color_text_primary: string  // "#0f172a"
  color_text_secondary: string // "#64748b"

  // 폰트
  font_heading: string        // "'Noto Sans KR', sans-serif"
  font_body: string           // "'Noto Sans KR', sans-serif"
  font_size_base: string      // "16px"
  font_weight_heading: string // "700"

  // 형태
  border_radius_base: string  // "8px"
  border_radius_card: string  // "16px"
  shadow_card: string         // "0 4px 24px rgba(0,0,0,0.08)"

  // 간격
  spacing_section: string     // "120px"
  spacing_container: string   // "1200px"
}

export interface SectionLayoutConfig {
  hero_style: 'fullscreen' | 'split' | 'centered' | 'magazine'
  card_style: 'grid' | 'list' | 'masonry' | 'carousel'
  nav_style: 'sticky' | 'transparent' | 'sidebar'
  footer_style: 'minimal' | 'full' | 'centered'
}

export type TemplateIndustry =
  | 'HOSPITAL' | 'PENSION' | 'STARTUP'
  | 'RESTAURANT' | 'SHOP' | 'EDUCATION' | 'GENERAL'
```

### 11.4 DB 스키마 추가

#### templates (템플릿 마스터)

```sql
CREATE TABLE templates (
  id              VARCHAR(50) PRIMARY KEY,     -- "TPL_MODERN_MINIMAL"
  name            VARCHAR(100) NOT NULL,
  description     TEXT,
  thumbnail_url   VARCHAR(500),
  preview_url     VARCHAR(500),
  industry_tags   VARCHAR(30)[],               -- 배열: ['HOSPITAL','STARTUP']
  css_variables   JSONB NOT NULL,              -- CSSVariableSet JSON
  section_layout  JSONB NOT NULL,              -- SectionLayoutConfig JSON
  is_premium      BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      SMALLINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 테넌트별 커스터마이징 오버라이드 저장
CREATE TABLE tenant_template_overrides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID UNIQUE NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id     VARCHAR(50) NOT NULL REFERENCES templates(id),
  -- 고객이 커스터마이징한 CSS 변수 (원본 템플릿에서 변경된 값만 저장)
  css_overrides   JSONB NOT NULL DEFAULT '{}',
  applied_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 템플릿 변경 이력 (롤백용)
CREATE TABLE template_change_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  from_template_id VARCHAR(50),
  to_template_id  VARCHAR(50) NOT NULL,
  css_snapshot    JSONB NOT NULL,              -- 변경 전 전체 CSS 변수 스냅샷
  changed_by      UUID REFERENCES users(id),
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_template_history_tenant ON template_change_history(tenant_id, changed_at DESC);
```

### 11.5 API 스펙

#### GET /templates
사용 가능한 템플릿 목록 조회

**Query Parameters:**
| 파라미터 | 타입 | 설명 |
|---|---|---|
| industry | string | 업종 필터 (`HOSPITAL`, `PENSION` 등) |
| plan | string | 현재 플랜 (`BASIC`이면 is_premium=false만 반환) |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "current_template_id": "TPL_WARM_TRUST",
    "templates": [
      {
        "id": "TPL_MODERN_MINIMAL",
        "name": "모던 미니멀",
        "thumbnail_url": "https://cdn.../tpl_modern_thumb.webp",
        "preview_url": "https://preview.cms.com/tpl/modern-minimal",
        "industry_tags": ["STARTUP", "HOSPITAL"],
        "is_premium": false,
        "is_current": false
      }
    ]
  }
}
```

#### POST /templates/apply
템플릿 적용 (콘텐츠 유지, 디자인만 교체)

**Request:**
```json
{
  "template_id": "TPL_MODERN_MINIMAL",
  "preserve_content": true    // 항상 true (콘텐츠 보존 강제)
}
```

**처리 순서:**
1. 현재 상태 스냅샷 → `template_change_history` INSERT (롤백 대비)
2. `tenant_template_overrides` UPSERT (css_overrides 초기화)
3. `tenants.template_type` 업데이트
4. CDN 캐시 퍼지 트리거
5. 응답 반환

**Response 200:**
```json
{
  "success": true,
  "data": {
    "applied_template_id": "TPL_MODERN_MINIMAL",
    "rollback_available": true,
    "rollback_expires_at": "2026-05-31T14:23:00Z"  // 7일간 롤백 가능
  }
}
```

#### POST /templates/rollback
이전 템플릿으로 롤백

#### PATCH /templates/customize
CSS 변수 개별 커스터마이징 (색상 피커, 폰트 선택)

**Request:**
```json
{
  "css_overrides": {
    "color_primary": "#e53e3e",
    "font_heading": "'Pretendard', sans-serif"
  }
}
```

### 11.6 화면 설계 (AD-06: 템플릿 선택기)

**URL:** `/admin/templates`

```
┌────────────────────────────────────────────────────────────────────┐
│  템플릿 선택                                                         │
│  디자인을 바꿔도 입력하신 내용(텍스트·이미지)은 그대로 유지됩니다.     │
├──────────────────────────────────────────────────────────────────┤
│  필터: [전체▾]  [병원 추천] [펜션 추천] [스타트업 추천]               │
│                                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │  [미리보기]   │  │  [미리보기]   │  │  [미리보기]   │             │
│  │  썸네일 이미지│  │  썸네일 이미지│  │  썸네일 이미지│             │
│  │              │  │              │  │  🔒 STANDARD │             │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤             │
│  │ ✅ 현재 적용  │  │ 모던 미니멀   │  │ 바이브런트    │             │
│  │ 따뜻한 신뢰감 │  │              │  │ (업그레이드 필요)│            │
│  │ [전체 미리보기]│  │[전체 미리보기]│  │[전체 미리보기]│             │
│  │              │  │ [이 템플릿    │  │              │             │
│  │              │  │  적용하기]    │  │              │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
│                                                                    │
│  ┌─── 현재 템플릿 커스터마이징 ─────────────────────────────────┐   │
│  │  메인 색상   [🎨 색상 피커: #c8553d        ]                 │   │
│  │  강조 색상   [🎨 색상 피커: #f59e0b        ]                 │   │
│  │  제목 폰트   [DRP: Noto Sans KR ▾         ]                 │   │
│  │  본문 폰트   [DRP: Noto Sans KR ▾         ]                 │   │
│  │                          [기본값으로 초기화] [변경 저장]      │   │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  이전 템플릿으로 돌아가기: [↩ 롤백 가능 - 3일 후 만료]               │
└────────────────────────────────────────────────────────────────────┘
```

**"전체 미리보기" 동작:**
- 별도 탭으로 `https://preview.cms.com/{tenant_slug}?tpl={template_id}` 오픈
- 실제 테넌트 콘텐츠 + 선택한 템플릿 CSS 조합으로 렌더링
- 쿠키/세션 없이 공개 접근 가능 (미리보기 전용 엔드포인트)

---

## 12. 인라인 편집 모드 (Live Edit Mode)

### 12.1 개념 및 UX 원칙

고객이 **자신의 홈페이지를 직접 보면서** 텍스트·이미지를 수정하는 방식.
관리자 페이지와 홈페이지를 오가는 불편함 없이, 홈페이지 위에서 바로 편집.

```
[편집 모드 OFF 상태 - 일반 방문자와 동일한 화면]
  → 로그인한 테넌트 어드민에게만 우측 하단 플로팅 버튼 노출
  → ✏️ "편집 모드 켜기"

[편집 모드 ON 상태]
  → 상단 고정 편집 툴바 노출
  → 모든 편집 가능 요소에 hover 시 파란 테두리 + 편집 아이콘
  → 텍스트 클릭: 인라인 텍스트 편집
  → 이미지 클릭: 이미지 업로드 팝업
  → 섹션 hover: 섹션 컨트롤 바 (이동/숨기기/설정)
```

### 12.2 편집 모드 화면 설계 (AD-07)

```
┌────────────────────────────────────────────────────────────────────┐
│  ✏️ 편집 모드  [템플릿 변경] [미리보기] [저장하기 💾] [편집 종료 ✕]  │  ← 고정 툴바
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌── 섹션 컨트롤 바 (섹션 hover 시 노출) ─────────────────────┐   │
│  │  ≡ 메인 비주얼 섹션        [↑ 위로] [↓ 아래로] [👁 숨기기] [⚙] │   │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                             │   │
│  │  ┌─────────────────────────────────────────────────────┐   │   │
│  │  │  [편집 가능 텍스트 - 클릭하면 인라인 편집]            │   │   │
│  │  │  강남 최고의 통증의학과, OO의원        ✏️             │   │   │
│  │  └─────────────────────────────────────────────────────┘   │   │
│  │                                                             │   │
│  │  ┌─────────────────────────────────────────────────────┐   │   │
│  │  │  [이미지 - 클릭하면 업로드 팝업]                      │   │   │
│  │  │                                                     │   │   │
│  │  │              🖼️  배경 이미지                📷       │   │   │
│  │  │                                                     │   │   │
│  │  └─────────────────────────────────────────────────────┘   │   │
│  │                                                             │   │
│  │  ┌─────────────────────────────────────────────────────┐   │   │
│  │  │  비수술적 치료로 당신의 관절 건강을 지킵니다.  ✏️      │   │   │
│  │  └─────────────────────────────────────────────────────┘   │   │
│  │                                                             │   │
│  │  [온라인 상담하기] ← 버튼 클릭시 링크/문구 설정 팝업        │   │
│  │                                                             │   │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│                              ✏️ 편집 모드 켜기  ← 플로팅 버튼(OFF시) │
└────────────────────────────────────────────────────────────────────┘
```

**텍스트 인라인 편집 동작:**

```
[텍스트 클릭]
  → contenteditable="true" 활성화
  → 미니 툴바 노출: [굵게] [기울임] [색상] [글자크기] [링크]
  → 실시간 글자 수 카운터 (최대 글자 수 초과 시 빨간색)

[텍스트 외부 클릭 or Enter]
  → contenteditable="false"
  → 변경된 내용을 로컬 상태에 임시 저장 (아직 DB 저장 X)
  → 상단 툴바의 [저장하기] 버튼에 뱃지: "3개 변경사항"

[저장하기 클릭]
  → 변경된 section_settings 일괄 PATCH 요청
  → 성공 시: "저장되었습니다 ✅" 토스트
  → 실패 시: 로컬 상태 유지 + "저장 실패, 다시 시도해주세요" 토스트
```

### 12.3 기술 구현 스펙

#### 편집 모드 활성화 방식

```typescript
// apps/client/lib/editMode.ts

// 편집 모드 진입 조건:
// 1. 테넌트 어드민 로그인 상태
// 2. URL에 ?edit=true 쿼리 OR 플로팅 버튼 클릭
// 3. 해당 테넌트의 사이트 접속 중

export const EDITABLE_ATTRS = {
  TEXT: 'data-editable="text"',
  IMAGE: 'data-editable="image"',
  LINK: 'data-editable="link"',
  SECTION: 'data-section-id',
} as const

// 편집 가능 컴포넌트 예시
// <h1
//   data-editable="text"
//   data-field="main_title"
//   data-section-id="sec_uuid_1"
//   data-max-length={40}
// >
//   {section.main_title}
// </h1>
```

#### 변경사항 임시 저장 구조 (Zustand)

```typescript
// apps/client/stores/editStore.ts
interface EditStore {
  isEditMode: boolean
  pendingChanges: Map<string, PendingChange>  // key: "{section_id}:{field}"
  isDirty: boolean  // 저장되지 않은 변경사항 존재 여부

  toggleEditMode: () => void
  updateField: (sectionId: string, field: string, value: string) => void
  saveAll: () => Promise<void>   // 일괄 PATCH API 호출
  discardAll: () => void         // 모든 변경사항 초기화
}

interface PendingChange {
  section_id: string
  field: string
  original_value: string   // 롤백용
  new_value: string
  changed_at: Date
}
```

#### 페이지 이탈 방지

```typescript
// 저장되지 않은 변경사항이 있을 때 페이지 이탈 시도 시
useEffect(() => {
  if (!isDirty) return
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    e.preventDefault()
    e.returnValue = '저장되지 않은 변경사항이 있습니다. 정말 나가시겠습니까?'
  }
  window.addEventListener('beforeunload', handleBeforeUnload)
  return () => window.removeEventListener('beforeunload', handleBeforeUnload)
}, [isDirty])
```

### 12.4 편집 가능 요소 유형별 동작 정의

| 요소 유형 | 트리거 | 편집 방식 | 저장 형태 |
|---|---|---|---|
| 단일 텍스트 (제목) | 클릭 | contenteditable 인라인 | `section_settings.main_title` |
| 멀티라인 텍스트 | 클릭 | contenteditable textarea | `section_settings.description` |
| 배경 이미지 | 클릭 | 파일 업로드 모달 | `section_settings.bg_image_url` |
| 갤러리 이미지 | 클릭 | 다중 파일 업로드 모달 | `gallery_items` 테이블 |
| 버튼 | 클릭 | 문구 + URL 입력 팝업 | `section_settings.cta_*` |
| 섹션 순서 | 드래그 | 드래그앤드롭 | `sections.display_order` |
| 섹션 노출 | 토글 | 클릭 | `sections.is_active` |

### 12.5 API 추가 스펙

#### POST /edit/batch-save
편집 모드에서 변경사항 일괄 저장

**Request:**
```json
{
  "changes": [
    {
      "section_id": "sec_uuid_1",
      "field": "main_title",
      "value": "새로운 병원 이름"
    },
    {
      "section_id": "sec_uuid_1",
      "field": "bg_image_url",
      "value": "https://cdn.cms.com/ten_uuid/hero/new.webp"
    },
    {
      "section_id": "sec_uuid_2",
      "field": "description",
      "value": "수정된 소개 문구입니다."
    }
  ]
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "saved_count": 3,
    "failed_count": 0,
    "cache_purged": true
  }
}
```

---

## 13. AI 편집 어시스턴트 (AI Edit Assistant)

### 13.1 개념 및 차별점

**경쟁사 대비 포지셔닝:**

| | 아임웹 | Wix | **본 시스템** |
|---|---|---|---|
| 템플릿 선택 | ✅ | ✅ | ✅ |
| 인라인 편집 | ❌ | ✅ | ✅ |
| AI 문구 추천 | 일부 | 일부 | ✅ **업종 특화** |
| AI 대화형 편집 | ❌ | ❌ | ✅ **킬러 기능** |
| AI Manager 연동 | ❌ | ❌ | ✅ **독점** |

**핵심 가치:** "나 대신 홈페이지를 고쳐주는 AI 직원"

### 13.2 AI 어시스턴트 기능 범위

#### 기능 1: 문구 자동 생성 (Phase 1 - 런칭 시)

편집 모드에서 텍스트 필드 클릭 시 AI 추천 버튼 노출.

```
[메인 타이틀 편집 중]

  강남 최고의 통증의학과, OO의원  ✏️  [🤖 AI 추천]
                                            ↓
                        ┌──────────────────────────────┐
                        │  AI 추천 문구 (3가지)          │
                        │                              │
                        │  1. "15년 경력 전문의와        │
                        │      함께하는 OO의원"          │
                        │     [적용]                   │
                        │                              │
                        │  2. "강남역 3분, 비수술 척추   │
                        │      전문 OO의원"             │
                        │     [적용]                   │
                        │                              │
                        │  3. "당신의 관절 주치의,       │
                        │      OO의원"                 │
                        │     [적용]                   │
                        │                              │
                        │  [다시 생성]  [직접 입력]       │
                        └──────────────────────────────┘
```

#### 기능 2: 대화형 편집 (Phase 2 - 런칭 후 3개월)

편집 모드 우측에 AI 채팅 패널 슬라이드.

```
┌─── AI 편집 어시스턴트 ────────────────────────────┐
│  안녕하세요! 홈페이지 편집을 도와드릴게요. 🤖       │
│  원하시는 변경사항을 말씀해 주세요.                 │
├───────────────────────────────────────────────┤
│                                               │
│  👤 "메인 배너를 좀 더 전문적인 느낌으로 바꿔줘"    │
│                                               │
│  🤖 네, 현재 문구를 분석했습니다.               │
│     3가지 전문적인 버전을 제안드려요:            │
│                                               │
│     ① "대한통증학회 인증 전문의, OO의원"         │
│        [적용] [더 수정]                        │
│     ② "20년 비수술 치료 노하우, OO의원"          │
│        [적용] [더 수정]                        │
│     ③ "건강보험심사평가원 우수의원 선정"          │
│        [적용] [더 수정]                        │
│                                               │
│  👤 "전체 색상을 파란색 계열로 바꿔줘"           │
│                                               │
│  🤖 색상 테마를 신뢰감 블루 계열로 변경할게요.    │
│     미리보기를 확인해 보세요.                   │
│     [색상 미리보기 적용 중... ✅]               │
│     [이대로 저장] [원래대로]                    │
│                                               │
├───────────────────────────────────────────────┤
│  [INP: 무엇을 바꾸고 싶으신가요?        ] [전송] │
└───────────────────────────────────────────────┘
```

#### 기능 3: AI 업종 분석 및 개선 제안 (Phase 2)

```
🤖 AI 분석 리포트 (월 1회 자동 생성)

  현재 홈페이지 분석 결과:
  ✅ 강점: 연락처 정보 명확, CTA 버튼 위치 적절
  ⚠️ 개선 필요:
     - 메인 타이틀이 경쟁사 대비 차별점 없음
     - 병원 소개 섹션 텍스트가 너무 길어 이탈률 증가 예상
     - 모바일 이미지 최적화 필요

  [AI가 자동으로 개선안 적용하기]
  [개선 제안 상세 보기]
```

### 13.3 AI 어시스턴트 기술 스펙

#### 백엔드 API

**POST /ai/suggest-copy**
문구 자동 생성

**Request:**
```json
{
  "section_type": "HERO_BANNER",
  "field": "main_title",
  "current_value": "강남 최고의 통증의학과, OO의원",
  "tenant_context": {
    "template_type": "HOSPITAL",
    "business_name": "OO의원",
    "keywords": ["강남", "통증의학과", "비수술"]
  },
  "tone": "professional",    // professional / warm / energetic
  "count": 3
}
```

**FastAPI 구현:**

```python
# app/api/routers/ai.py
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate
from app.schemas.ai import CopySuggestRequest, CopySuggestResponse

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.8)

COPY_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """당신은 한국 소상공인 홈페이지 카피라이팅 전문가입니다.
업종: {template_type}
업체명: {business_name}
핵심 키워드: {keywords}
요청 톤앤매너: {tone}

규칙:
- 최대 {max_length}자 이내
- 한국어로 작성
- 신뢰감과 전문성 강조
- 지역명 자연스럽게 포함
- JSON 배열로만 응답: ["문구1", "문구2", "문구3"]"""),
    ("human", "현재 문구 '{current_value}'를 {count}가지로 개선해주세요.")
])

@router.post("/suggest-copy", response_model=CopySuggestResponse)
async def suggest_copy(body: CopySuggestRequest, current_user = Depends(get_current_user)):
    chain = COPY_PROMPT | llm
    result = await chain.ainvoke({
        "template_type": body.tenant_context.template_type,
        "business_name": body.tenant_context.business_name,
        "keywords": ", ".join(body.tenant_context.keywords),
        "tone": body.tone,
        "max_length": 40,
        "current_value": body.current_value,
        "count": body.count
    })
    suggestions = json.loads(result.content)
    return CopySuggestResponse(suggestions=suggestions)
```

**POST /ai/chat-edit**
대화형 편집 (스트리밍 응답)

```python
@router.post("/chat-edit")
async def chat_edit(body: ChatEditRequest, current_user = Depends(get_current_user)):
    """AI 대화형 편집 - SSE 스트리밍 응답"""
    async def stream_response():
        # 현재 테넌트 사이트 상태를 컨텍스트로 주입
        site_context = await get_site_context(current_user.tenant_id)

        system_prompt = f"""
        당신은 홈페이지 편집을 도와주는 AI 어시스턴트입니다.
        현재 사이트 정보: {json.dumps(site_context, ensure_ascii=False)}

        사용자의 요청을 분석하여 다음 중 하나로 응답하세요:
        1. 텍스트 변경: action="update_text", section_id, field, new_value
        2. 색상 변경: action="update_theme", css_overrides
        3. 템플릿 변경: action="change_template", template_id
        4. 설명만 필요: action="explain"

        항상 한국어로 친근하게 응답하고,
        변경 액션이 있을 경우 JSON 블록을 포함하세요.
        """

        async for chunk in llm.astream([
            SystemMessage(content=system_prompt),
            *body.conversation_history,
            HumanMessage(content=body.message)
        ]):
            yield f"data: {json.dumps({'delta': chunk.content})}

"

    return StreamingResponse(stream_response(), media_type="text/event-stream")
```

### 13.4 AI 사용량 관리

| 기능 | BASIC | STANDARD | PREMIUM |
|---|---|---|---|
| 문구 추천 (월) | 20회 | 100회 | 무제한 |
| 대화형 편집 | ❌ | 월 50회 | 무제한 |
| AI 분석 리포트 | ❌ | 월 1회 | 월 4회 |
| AI 템플릿 추천 | ❌ | ✅ | ✅ |

**사용량 추적 테이블:**

```sql
CREATE TABLE ai_usage_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feature         VARCHAR(50) NOT NULL,
                  -- COPY_SUGGEST, CHAT_EDIT, ANALYSIS_REPORT
  tokens_used     INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_usage_tenant_month
  ON ai_usage_log(tenant_id, date_trunc('month', created_at));
```

### 13.5 오픈 이슈 추가 (섹션 10 연동)

| # | 이슈 | 옵션 A | 옵션 B | 결정 기한 | 담당 |
|---|---|---|---|---|---|
| 7 | AI 문구 생성 모델 | GPT-4o-mini (저비용) | Claude Haiku (품질↑) | 2주차 | AI 팀 |
| 8 | 인라인 편집 텍스트 엔진 | contenteditable 직접 구현 | Tiptap headless | 2주차 | 프론트 |
| 9 | 템플릿 미리보기 방식 | iframe 삽입 | 별도 서브도메인 | 3주차 | 풀스택 |
| 10 | AI 채팅 응답 방식 | SSE 스트리밍 | 일반 REST (완성 후 반환) | 2주차 | 백엔드 |


---

## 14. 슈퍼 어드민 시스템 (Super Admin System)

### 14.1 개념 및 역할 정의

슈퍼 어드민은 **운영사(우리 회사)** 가 전체 SaaS 플랫폼을 관리하는 최상위 관리자 시스템이다.
테넌트 어드민이 "자기 홈페이지"를 관리한다면, 슈퍼 어드민은 "플랫폼 전체"를 관리한다.

```
슈퍼 어드민 (운영사)
    ├── 전체 테넌트 관리 (생성·수정·삭제·플랜 변경)
    ├── 기능 관리 (테넌트별 기능 On/Off, 업데이트 배포)
    ├── 플랫폼 모니터링 (방문자·문의·AI 비용·서버 상태)
    ├── 수익 관리 (MRR·플랜별 통계·만료 예정 알림)
    ├── 템플릿 관리 (전체 템플릿 추가·수정·배포)
    └── 공지 및 커뮤니케이션 (테넌트 공지·긴급 알림)
```

### 14.2 슈퍼 어드민 전용 앱 구조

슈퍼 어드민은 별도 앱(`apps/superadmin`)으로 분리한다.
테넌트 어드민(`apps/admin`)과 완전히 독립된 접근 경로를 가진다.

```
apps/
├── admin/          ← 테넌트 어드민 (고객용)
│   admin.도메인.com
│
├── superadmin/     ← 슈퍼 어드민 (운영사 전용) ★신규
│   system.도메인.com  (외부 비공개 URL)
│
└── client/         ← 고객 홈페이지
    도메인.com
```

**superadmin 앱 디렉토리 구조:**
```
apps/superadmin/
├── src/
│   ├── components/
│   │   ├── tenants/          ← 테넌트 관리 컴포넌트
│   │   ├── features/         ← 기능 관리 컴포넌트
│   │   ├── monitoring/       ← 모니터링 컴포넌트
│   │   ├── revenue/          ← 수익 관리 컴포넌트
│   │   ├── templates/        ← 템플릿 관리 컴포넌트
│   │   └── announcements/    ← 공지 관리 컴포넌트
│   ├── pages/
│   │   ├── DashboardPage.tsx
│   │   ├── TenantsPage.tsx
│   │   ├── TenantDetailPage.tsx
│   │   ├── FeaturesPage.tsx
│   │   ├── MonitoringPage.tsx
│   │   ├── RevenuePage.tsx
│   │   ├── TemplatesPage.tsx
│   │   └── AnnouncementsPage.tsx
│   ├── stores/
│   │   └── superAuthStore.ts
│   └── lib/
│       └── superApi.ts       ← 슈퍼 어드민 전용 API 클라이언트
├── vite.config.ts
└── package.json
```

---

### 14.3 핵심 기능: 테넌트별 기능 관리 (Feature Flag System)

**가장 중요한 기능.** 슈퍼 어드민이 특정 테넌트에게만 새 기능을 켜주거나, 전체 테넌트에게 순차적으로 기능을 배포할 수 있다.

#### 기능 플래그 개념

```
슈퍼 어드민에서 새 기능 추가:
    "AI 월간 리포트" 기능 생성
         ↓
    배포 방식 선택:
    ┌─────────────────────────────────────────┐
    │  전체 배포    → 모든 테넌트 즉시 활성화   │
    │  플랜별 배포  → PREMIUM만 활성화          │
    │  선택 배포    → 특정 테넌트만 활성화       │
    │  점진적 배포  → 10% → 50% → 100% 순차    │
    └─────────────────────────────────────────┘
         ↓
    테넌트 어드민 관리자 페이지에
    새 메뉴/기능 자동 노출
```

#### DB 스키마

```sql
-- 기능 마스터 테이블
CREATE TABLE features (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key             VARCHAR(100) UNIQUE NOT NULL,  -- "AI_MONTHLY_REPORT"
    name            VARCHAR(200) NOT NULL,          -- "AI 월간 리포트"
    description     TEXT,
    category        VARCHAR(50) NOT NULL,
                    -- CONTENT, NOTIFICATION, AI, SEO, ANALYTICS, INTEGRATION
    menu_path       VARCHAR(200),                  -- "/admin/reports" (관리자 메뉴 경로)
    menu_icon       VARCHAR(50),                   -- "chart-bar" (lucide 아이콘명)
    menu_label      VARCHAR(100),                  -- "월간 리포트"
    menu_position   SMALLINT DEFAULT 99,           -- 사이드바 정렬 순서
    default_enabled BOOLEAN NOT NULL DEFAULT false,
    required_plan   VARCHAR(20),                   -- NULL=전체, "STANDARD", "PREMIUM"
    is_beta         BOOLEAN NOT NULL DEFAULT false,-- 베타 기능 뱃지 표시
    is_active       BOOLEAN NOT NULL DEFAULT true, -- 전체 비활성화 스위치
    release_note    TEXT,                          -- 업데이트 내용 (테넌트에게 노출)
    released_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 테넌트별 기능 활성화 상태
CREATE TABLE tenant_features (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    feature_id      UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
    is_enabled      BOOLEAN NOT NULL DEFAULT false,
    enabled_at      TIMESTAMPTZ,
    enabled_by      UUID REFERENCES users(id),     -- 슈퍼 어드민 계정
    override_reason TEXT,                          -- 수동 활성화 사유
    UNIQUE (tenant_id, feature_id)
);

CREATE INDEX idx_tenant_features_tenant ON tenant_features(tenant_id);
CREATE INDEX idx_tenant_features_feature ON tenant_features(feature_id);

-- 기능 배포 이력
CREATE TABLE feature_deployments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feature_id      UUID NOT NULL REFERENCES features(id),
    deployment_type VARCHAR(30) NOT NULL,
                    -- GLOBAL, PLAN_BASED, SELECTIVE, GRADUAL
    target_plan     VARCHAR(20),                   -- PLAN_BASED 시
    target_tenants  UUID[],                        -- SELECTIVE 시
    rollout_percent SMALLINT,                      -- GRADUAL 시 (0~100)
    affected_count  INTEGER,                       -- 영향받은 테넌트 수
    deployed_by     UUID REFERENCES users(id),
    deployed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rollback_at     TIMESTAMPTZ,
    notes           TEXT
);

-- 테넌트 공지/알림
CREATE TABLE announcements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           VARCHAR(200) NOT NULL,
    content         TEXT NOT NULL,
    type            VARCHAR(30) NOT NULL,
                    -- INFO, WARNING, FEATURE_UPDATE, MAINTENANCE, URGENT
    target_type     VARCHAR(20) NOT NULL DEFAULT 'ALL',
                    -- ALL, PLAN_BASED, SELECTIVE
    target_plan     VARCHAR(20),
    target_tenants  UUID[],
    is_published    BOOLEAN NOT NULL DEFAULT false,
    show_in_admin   BOOLEAN NOT NULL DEFAULT true,  -- 테넌트 관리자 페이지에 노출
    send_email      BOOLEAN NOT NULL DEFAULT false,
    send_kakao      BOOLEAN NOT NULL DEFAULT false,
    published_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 테넌트별 공지 읽음 여부
CREATE TABLE announcement_reads (
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    read_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, announcement_id)
);
```

---

### 14.4 화면 설계 (슈퍼 어드민 전용)

#### SA-01: 슈퍼 어드민 대시보드

**URL:** `system.도메인.com/dashboard`

```
┌────────────────────────────────────────────────────────────────────┐
│  🛡️ CMS 운영 대시보드          [시스템 상태: ✅ 정상]  [로그아웃]   │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │전체 테넌트│  │ 이번달   │  │ 활성     │  │  이번달 AI 비용   │  │
│  │  127개   │  │  MRR     │  │ 알림톡   │  │                  │  │
│  │ (+3 신규)│  │ 2,190만원│  │ 4,721건  │  │   $48.2 / $200  │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘  │
│                                                                    │
│  ┌─── 플랜별 현황 ──────────┐  ┌─── 만료 예정 테넌트 ───────────┐  │
│  │  BASIC    ·····  72개   │  │  🔴 OO의원 - 3일 후 만료       │  │
│  │  STANDARD ·····  42개   │  │  🟡 강원펜션 - 7일 후 만료     │  │
│  │  PREMIUM  ·····  13개   │  │  🟡 스타트업A - 10일 후 만료   │  │
│  │  [MRR 차트]             │  │           [전체보기]           │  │
│  └─────────────────────────┘  └───────────────────────────────┘  │
│                                                                    │
│  ┌─── 최근 신규 테넌트 ──────────────────────────────────────────┐  │
│  │  강남치과 (BASIC) - 2시간 전 가입     [설정] [플랜변경] [접속] │  │
│  │  제주펜션블루 (STANDARD) - 1일 전     [설정] [플랜변경] [접속] │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

#### SA-02: 테넌트 관리

**URL:** `system.도메인.com/tenants`

```
┌────────────────────────────────────────────────────────────────────┐
│  테넌트 관리                        [+ 신규 테넌트 생성]             │
├──────────────────────────────────────────────────────────────────┤
│  [INP: 검색] [DRP: 플랜▾] [DRP: 업종▾] [DRP: 상태▾] [DRP: 정렬▾]  │
├──────────────────────────────────────────────────────────────────┤
│  ┌──────┬──────────┬────────┬──────────┬────────┬────────┬──────┐ │
│  │ 테넌트│ 업종     │ 플랜   │ 만료일   │ 방문자 │ 문의 수│ 관리 │ │
│  ├──────┼──────────┼────────┼──────────┼────────┼────────┼──────┤ │
│  │OO의원│ 병원     │STANDARD│ 26.06.30 │  124  │   7   │[상세]│ │
│  │강원펜션│ 펜션   │ BASIC  │ 26.06.01 │   88  │   3   │[상세]│ │
│  └──────┴──────────┴────────┴──────────┴────────┴────────┴──────┘ │
└────────────────────────────────────────────────────────────────────┘
```

#### SA-03: 테넌트 상세 + 기능 관리 (핵심 화면)

**URL:** `system.도메인.com/tenants/{id}`

```
┌────────────────────────────────────────────────────────────────────┐
│  ← 테넌트 목록   |  OO의원 상세                                      │
│  [TAB: 기본정보] [TAB: 기능 관리] [TAB: 사용 현황] [TAB: 히스토리]    │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ── [TAB: 기능 관리] ─────────────────────────────────────────── │
│                                                                    │
│  이 테넌트에서 활성화된 기능을 관리합니다.                            │
│  변경 즉시 테넌트 관리자 페이지에 반영됩니다.                         │
│                                                                    │
│  ┌─── 콘텐츠 기능 ──────────────────────────────────────────────┐  │
│  │  섹션 편집기          [TGL: ON ]  ← 기본 기능 (끌 수 없음)    │  │
│  │  드래그 섹션 순서 변경 [TGL: ON ]                             │  │
│  │  갤러리 섹션           [TGL: ON ]                             │  │
│  │  동영상 섹션           [TGL: OFF]  [? 이 테넌트만 비활성화]    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌─── AI 기능 ─────────────────────────────────────────────────┐   │
│  │  AI 문구 추천          [TGL: ON ]  월 100회 / 100회 사용 중   │   │
│  │  AI 대화형 편집        [TGL: ON ]  🆕 BETA                   │   │
│  │  AI 월간 리포트        [TGL: OFF]  → [활성화] PREMIUM 전용    │   │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌─── 알림 기능 ────────────────────────────────────────────────┐  │
│  │  카카오 알림톡         [TGL: ON ]  월 47건 / 100건            │  │
│  │  이메일 알림           [TGL: OFF]                             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌─── SEO/마케팅 기능 ──────────────────────────────────────────┐  │
│  │  SEO 마법사           [TGL: ON ]                              │  │
│  │  구글 서치콘솔 연동    [TGL: OFF]  [활성화]                    │  │
│  │  네이버 애널리틱스     [TGL: OFF]  [활성화] 🆕 NEW             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  [변경사항 저장]  [이 테넌트 관리자 페이지로 접속 →]                  │
└────────────────────────────────────────────────────────────────────┘
```

#### SA-04: 전체 기능 배포 관리

**URL:** `system.도메인.com/features`

```
┌────────────────────────────────────────────────────────────────────┐
│  기능 배포 관리                          [+ 새 기능 등록]            │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─── 등록된 기능 목록 ─────────────────────────────────────────┐  │
│  │                                                              │  │
│  │  AI 월간 리포트             🆕 NEW   [배포 관리]  [수정]      │  │
│  │  활성 테넌트: 13개 / 127개  PREMIUM 전용                      │  │
│  │                                                              │  │
│  │  네이버 애널리틱스 연동      🔵 BETA  [배포 관리]  [수정]      │  │
│  │  활성 테넌트: 5개 / 127개   전체 플랜                          │  │
│  │                                                              │  │
│  │  AI 대화형 편집             🔵 BETA  [배포 관리]  [수정]      │  │
│  │  활성 테넌트: 38개 / 127개  STANDARD 이상                     │  │
│  │                                                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ── 기능 배포 모달 (배포 관리 클릭 시) ──────────────────────────   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  "AI 월간 리포트" 배포 설정                          [×]      │  │
│  │                                                              │  │
│  │  배포 방식:                                                   │  │
│  │  ○ 전체 배포      → 127개 테넌트 전체 즉시 활성화             │  │
│  │  ● 플랜별 배포    → [DRP: PREMIUM ▾] 13개 테넌트             │  │
│  │  ○ 테넌트 선택    → [테넌트 검색·선택]                        │  │
│  │  ○ 점진적 배포    → [INP: 10]% 먼저 → 이후 수동 확대         │  │
│  │                                                              │  │
│  │  테넌트 알림:                                                 │  │
│  │  ☑ 관리자 페이지 공지 노출                                    │  │
│  │  ☑ 카카오 알림톡 발송 ("새 기능이 추가되었습니다!")            │  │
│  │  ☐ 이메일 발송                                               │  │
│  │                                                              │  │
│  │  업데이트 노트: (테넌트에게 노출될 내용)                        │  │
│  │  [TEXTAREA: AI가 매월 자동으로 방문자·문의 데이터를...]        │  │
│  │                                                              │  │
│  │                        [취소]  [배포 실행]                    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

#### SA-05: 공지 관리

**URL:** `system.도메인.com/announcements`

```
┌────────────────────────────────────────────────────────────────────┐
│  공지 및 알림 관리                         [+ 새 공지 작성]          │
├──────────────────────────────────────────────────────────────────┤
│  ┌─── 공지 작성 폼 ────────────────────────────────────────────┐   │
│  │  제목:   [INP: 5월 정기 점검 안내                    ]        │   │
│  │  유형:   [DRP: 점검 안내 (MAINTENANCE) ▾]                    │   │
│  │  대상:   ○ 전체  ● 플랜별 [DRP: STANDARD이상▾]  ○ 선택       │   │
│  │                                                              │   │
│  │  내용:                                                        │   │
│  │  [TEXTAREA: 5월 26일 새벽 2시~4시 정기 점검이 진행됩니다...] │   │
│  │                                                              │   │
│  │  발송 방법:                                                   │   │
│  │  ☑ 관리자 페이지 상단 배너 노출   만료일: [날짜 피커]          │   │
│  │  ☑ 카카오 알림톡 즉시 발송                                    │   │
│  │  ☐ 이메일 발송                                               │   │
│  │                                                              │   │
│  │  [미리보기]                    [임시저장]  [즉시 발송]         │   │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

---

### 14.5 테넌트 관리자 페이지 연동 (기능 플래그 반영)

슈퍼 어드민에서 기능을 켜면 **테넌트 관리자 페이지에 즉시 반영**된다.

#### 기능 플래그 확인 API

```python
# app/api/v1/endpoints/public.py
# 테넌트 관리자 앱 초기화 시 호출
GET /api/v1/tenant/features

# Response
{
  "features": {
    "SECTION_EDITOR": true,
    "DRAG_SECTION_ORDER": true,
    "GALLERY_SECTION": true,
    "VIDEO_SECTION": false,       ← 슈퍼 어드민이 OFF
    "AI_COPY_SUGGEST": true,
    "AI_CHAT_EDIT": true,         ← BETA
    "AI_MONTHLY_REPORT": false,   ← PREMIUM 전용, 이 테넌트는 STANDARD
    "KAKAO_NOTIFICATION": true,
    "SEO_WIZARD": true,
    "NAVER_ANALYTICS": false      ← 아직 미배포
  },
  "announcements": [              ← 읽지 않은 공지 목록
    {
      "id": "ann_uuid",
      "title": "AI 대화형 편집 베타 오픈!",
      "type": "FEATURE_UPDATE",
      "content": "...",
      "is_read": false
    }
  ]
}
```

#### 테넌트 관리자 사이드바 동적 렌더링

```typescript
// apps/admin/src/components/layout/Sidebar.tsx
// 기능 플래그에 따라 메뉴 항목 동적 노출

const menuItems = [
  { key: 'DASHBOARD',         path: '/admin/dashboard',   label: '대시보드',    icon: 'layout-dashboard', always: true },
  { key: 'SECTION_EDITOR',    path: '/admin/content',     label: '콘텐츠 편집', icon: 'pencil'           },
  { key: 'INQUIRY_MANAGE',    path: '/admin/inquiries',   label: '문의 관리',   icon: 'inbox',  always: true },
  { key: 'SNS_SETTINGS',      path: '/admin/sns',         label: 'SNS 연동',    icon: 'share-2'          },
  { key: 'SEO_WIZARD',        path: '/admin/seo',         label: 'SEO 설정',    icon: 'search'           },
  { key: 'TEMPLATE_SELECT',   path: '/admin/templates',   label: '템플릿',      icon: 'layout'           },
  { key: 'AI_MONTHLY_REPORT', path: '/admin/reports',     label: 'AI 리포트',   icon: 'chart-bar', badge: 'NEW' },
  { key: 'NAVER_ANALYTICS',   path: '/admin/analytics',   label: '방문 분석',   icon: 'trending-up'      },
]

// 렌더링 시: always=true 또는 features[key]=true 인 항목만 표시
const visibleMenus = menuItems.filter(item =>
  item.always || features[item.key]
)
```

#### 공지 배너 자동 노출

```typescript
// apps/admin/src/components/layout/AnnouncementBanner.tsx
// 읽지 않은 공지가 있으면 관리자 페이지 상단에 자동 노출

{announcements.filter(a => !a.is_read).map(ann => (
  <div key={ann.id} className={`announcement-banner type-${ann.type}`}>
    <span>{ann.title}</span>
    <button onClick={() => markAsRead(ann.id)}>확인</button>
  </div>
))}
```

---

### 14.6 슈퍼 어드민 API 스펙

**Base URL:** `/api/super/v1/` (일반 `/api/v1/`과 완전 분리)
**접근 권한:** `SUPER_ADMIN` role만 접근 가능 (미들웨어에서 강제)

#### 테넌트 관리 API

```
GET    /api/super/v1/tenants                    전체 테넌트 목록 (검색·필터·페이지네이션)
POST   /api/super/v1/tenants                    신규 테넌트 생성
GET    /api/super/v1/tenants/{id}               테넌트 상세 조회
PATCH  /api/super/v1/tenants/{id}               테넌트 정보 수정
DELETE /api/super/v1/tenants/{id}               테넌트 비활성화 (소프트 삭제)
PATCH  /api/super/v1/tenants/{id}/plan          플랜 변경
POST   /api/super/v1/tenants/{id}/impersonate   대리 접속 토큰 발급 ★
POST   /api/super/v1/tenants/{id}/reset-password 어드민 비밀번호 초기화
GET    /api/super/v1/tenants/{id}/stats         테넌트 사용 현황
```

**★ 대리 접속 (Impersonate) — 중요 기능:**
```python
# 슈퍼 어드민이 특정 테넌트 관리자 페이지에 직접 접속 가능
# (고객 지원, 디버깅 목적)
POST /api/super/v1/tenants/{id}/impersonate

# Response:
{
  "impersonate_token": "eyJ...",  # 30분짜리 단기 토큰
  "redirect_url": "https://admin.mysite.com?token=eyJ..."
}
# → 슈퍼 어드민이 해당 URL 접속 시 테넌트 어드민으로 로그인된 상태
# → 모든 대리 접속 행위는 audit_logs 테이블에 기록
```

#### 기능 관리 API

```
GET    /api/super/v1/features                           전체 기능 목록
POST   /api/super/v1/features                           새 기능 등록
PATCH  /api/super/v1/features/{id}                      기능 정보 수정
POST   /api/super/v1/features/{id}/deploy               기능 배포 실행
POST   /api/super/v1/features/{id}/rollback             기능 배포 롤백
GET    /api/super/v1/tenants/{id}/features              테넌트별 기능 목록
PATCH  /api/super/v1/tenants/{id}/features/{feature_id} 테넌트 개별 기능 On/Off
```

#### 대시보드·모니터링 API

```
GET /api/super/v1/dashboard/stats       전체 통계 (테넌트 수, MRR, 알림톡 수, AI 비용)
GET /api/super/v1/dashboard/mrr-chart   MRR 추이 차트 데이터
GET /api/super/v1/dashboard/expiring    만료 예정 테넌트 목록
GET /api/super/v1/monitoring/ai-cost    AI 비용 현황 (OpenAI 월별)
GET /api/super/v1/monitoring/errors     최근 서버 에러 목록 (Sentry 연동)
GET /api/super/v1/monitoring/queue      Celery 큐 대기 현황
```

#### 공지 API

```
GET    /api/super/v1/announcements              공지 목록
POST   /api/super/v1/announcements              공지 생성 + 발송
PATCH  /api/super/v1/announcements/{id}         공지 수정
DELETE /api/super/v1/announcements/{id}         공지 삭제
POST   /api/super/v1/announcements/{id}/send    즉시 발송 (예약 발송 포함)
```

---

### 14.7 추가 DB 테이블

#### audit_logs (슈퍼 어드민 행위 감사 로그)

```sql
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id        UUID NOT NULL REFERENCES users(id),
    actor_role      VARCHAR(20) NOT NULL,           -- SUPER_ADMIN
    action          VARCHAR(100) NOT NULL,
                    -- TENANT_CREATED, PLAN_CHANGED, FEATURE_TOGGLED,
                    -- IMPERSONATE_START, PASSWORD_RESET, FEATURE_DEPLOYED
    target_type     VARCHAR(50),                    -- tenant, feature, announcement
    target_id       UUID,
    before_value    JSONB,                          -- 변경 전 값
    after_value     JSONB,                          -- 변경 후 값
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id, created_at DESC);
CREATE INDEX idx_audit_logs_target ON audit_logs(target_type, target_id);
```

---

### 14.8 보안 규칙

| 항목 | 규칙 |
|---|---|
| 접근 URL | `system.도메인.com` — 외부 비공개, IP 화이트리스트 권장 |
| 인증 | 별도 슈퍼 어드민 계정 (테넌트 어드민 계정과 완전 분리) |
| 2FA | TOTP(Google Authenticator) 2단계 인증 필수 |
| 대리 접속 | 모든 Impersonate 행위 audit_logs 필수 기록 |
| 세션 | Access Token 5분 (테넌트보다 짧게) |
| 로그 | 모든 쓰기 작업(PATCH·DELETE·POST) audit_logs 자동 기록 |

---

### 14.9 오픈 이슈 추가

| # | 이슈 | 옵션 A | 옵션 B | 결정 기한 | 담당 |
|---|---|---|---|---|---|
| 11 | 슈퍼 어드민 2FA | TOTP (Google Authenticator) | SMS OTP | 1주차 | 백엔드 |
| 12 | 대리 접속 알림 | 테넌트에게 알림 발송 | 로그만 기록 | 2주차 | PM |
| 13 | 기능 플래그 캐싱 | Redis 5분 캐시 | 실시간 DB 조회 | 1주차 | 백엔드 |
| 14 | AI 비용 추적 방식 | OpenAI Usage API 연동 | 자체 토큰 카운팅 | 2주차 | 백엔드 |


---

*본 문서는 시스템 개발 과정에서 지속적으로 업데이트됩니다.*  
*변경 이력은 Git commit log로 관리합니다.*  
*문의: 개발팀 내부 슬랙 채널 `#cms-admin-dev`*
