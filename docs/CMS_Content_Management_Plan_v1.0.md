# CMS 콘텐츠 관리 상세 기획서

**버전:** v1.0 (2026-11-27 사용자 결정)
**태스크:** TASK.md Phase 23 (T-253 ~ T-260)
**와이어프레임:** `docs/mockups/page-content/wireframes.html` CM-01 ~ CM-09 (처음 의도 — 각 화면 설명의 "v3.1:" 앞부분)
**관계 문서:** `docs/CMS_Page_Content_Plan_v1.0.md` — 페이지 관리(PART A)는 그대로, PART B(콘텐츠 관리 = 게시판 재사용)를 이 문서가 대신한다

## 0. 왜 다시 쓰나

Phase 22 는 기획서 v3.1 대로 콘텐츠 관리를 **게시판 위에** 만들었다(콘텐츠형 프리셋 · 게시판 연결 섹션 · 게시글 관리 필터). 와이어프레임의 처음 의도는 게시판과 다른 **독립 콘텐츠 관리**(유형 · 항목 · 상태 · 카테고리 · 태그 · 공통 블록)였고, 2026-11-27 사용자가 처음 의도대로 만들기로 정했다.

- **게시판 = 소통:** 방문자 글쓰기 · 댓글 · 신고 · 회원 권한. 후기 · 문의형 글은 게시판
- **콘텐츠 = 홈페이지에 들어갈 정보:** 서비스 · FAQ · 연혁 · 팀 · 제품 · 고객사처럼 관리자만 쓰고 섹션으로 보여 주는 것

## 1. 결정 (2026-11-27 사용자)

| # | 질문 | 결정 |
|---|---|---|
| 1 | 독립 콘텐츠 관리로 다시 만들지 | **만든다** — 처음 의도(CM-01 · 02 · 03 · 05) |
| 2 | CM-04 공통 블록 | **마지막 PR 로 포함** (T-260) |
| 3 | 이미 만든 콘텐츠형 게시판 · 게시판 연결 섹션 · 게시글 관리 필터 | **그대로 둔다** — 옮기지 않음, 두 방식이 함께 |
| 4 | 요금제 | **STANDARD 이상** — 기능 스위치 `CONTENT_MANAGE`(기본 꺼짐), 유형 수 FREE 0 · BASIC 0 · STANDARD 10 · PREMIUM 무제한 (`CONTENT_TYPE_LIMITS`, 직접 만든 페이지와 같은 모양) |
| 5 | 항목 상태 | **초안 · 공개 2단계** — 공개만 홈페이지에 나옴. 승인 · 예약 발행은 후속 |

**계속 후속:** CM-06 별도 AI 센터 · CM-07 승인 · 예약 발행 · CM-08 다국어 · CM-09 성과 (페이지 관리 기획서 PART B '후속' 그대로).

## 2. 현재 시스템 기준

| 항목 | 지금 | 이 기획에서 |
|---|---|---|
| 사이트 | 사업체 하나 = 사이트 하나, 모든 표 `tenant_id` + RLS | 새 표 모두 같은 규칙 |
| 칸 종류 | 게시판 추가 칸 12가지(`schemas/board.py` `FieldType`), 값 검사 `board_field` · `field_convert` | **같은 칸 종류 · 검사 함수를 함께 쓴다** (게시판 전용 `RATING` 은 제외) |
| 본문 | Tiptap 노드 JSON (`rich_text`) | 그대로 |
| 사진 | 업로드 API · 안 쓰는 사진 정리 | 콘텐츠 사진도 정리 대상에서 제외 목록에 넣음 |
| 섹션 연결 | 테마형 `BOARD_LATEST`(게시판 연결, T-243) | 새 섹션 `CONTENT_LIST`(콘텐츠 연결). 테마형부터, 코드형은 후속(T-243 과 같음) |
| 삭제 | 소프트 삭제 원칙, 실제 삭제 예외 3개 | 휴지통(복구)만, **실제 삭제 없음** — 예외 목록에 더하지 않는다 |
| AI | 화면 안 버튼 → 서랍, `AI_SITE_ASSIST` 스위치 · 한도 · `ai_usage_log` | 같은 방식 (T-259) |
| 권한 | `TENANT_ADMIN` · `TENANT_VIEWER` | 보기 전용은 읽기만 |

## 3. 메뉴

```text
콘텐츠 관리                         (/admin/contents) — CONTENT_MANAGE 꺼지면 메뉴 없음
├─ 콘텐츠 목록                      CM-01  /admin/contents
├─ 콘텐츠 작성                      CM-02  /admin/contents/new?type={유형}
├─ 콘텐츠 유형                      CM-03  /admin/contents/types
├─ 카테고리 · 태그                  CM-05  /admin/contents/taxonomy
└─ 공통 블록                        CM-04  /admin/contents/blocks (T-260)
```

사이드바 "페이지 관리" 바로 아래. 휴대폰 아래 탭은 바꾸지 않는다(전체 메뉴에서).

## 4. 데이터 (마이그레이션 0064 — T-253 · T-254, 0065 — T-260)

모든 표: UUID PK, `tenant_id`(사업체 지우면 함께 · 해지 파기 PURGE 목록), `created_at` · `updated_at`, RLS 표준 정책, 소프트 삭제 `deleted_at`.

```sql
content_types (                       -- CM-03
  type_key VARCHAR(40)                -- 영문 소문자 · 숫자 · 하이픈, 사업체 안에서 하나 (휴지통 포함)
  name VARCHAR(40), description VARCHAR(200),
  preset_key VARCHAR(30) NULL,        -- 시작용 유형에서 만들었으면 그 키
  display_order INT
)
content_type_fields (                 -- CM-03, 모양은 board_fields 와 같다
  type_id FK, field_key, label, field_type, is_required, help_text, placeholder,
  default_value JSONB, field_options JSONB, display_order
  UNIQUE (type_id, field_key)
)
content_items (                       -- CM-01 · 02
  type_id FK, category_id FK NULL,
  title VARCHAR(100), summary VARCHAR(300), body JSONB(Tiptap), data JSONB(칸 값),
  thumbnail_url TEXT NULL,
  status VARCHAR(10) CHECK IN ('DRAFT','PUBLISHED'), published_at TIMESTAMPTZ NULL,
  display_order INT, created_by FK users, updated_by FK users
)
content_categories (                  -- CM-05, 유형별 · 2단계
  type_id FK, parent_id FK NULL(자기 자신, 1단계만), name VARCHAR(30), display_order
)
content_tags (name VARCHAR(30), UNIQUE (tenant_id, lower(name)) WHERE deleted_at IS NULL)  -- 사업체 공통
content_item_tags (item_id FK, tag_id FK, tenant_id, PRIMARY KEY (item_id, tag_id))
-- T-260
content_blocks (name, block_type(섹션 종류), settings JSONB, ...)   -- CM-04 공통 블록
sections.block_id FK NULL            -- 참조형 연결 (복사형은 값만 복사하고 연결 없음)
```

- 칸 값 `data` 는 유형 칸 정의로 서버가 검사 (필수 · 종류 · 선택지 · 길이). 칸을 지우면 값은 남기고 화면에서만 빠짐(게시판과 같음)
- 유형 칸 종류를 바꾸면 기존 값 변환은 게시판 칸 변환(`field_convert`) 규칙 그대로
- 공개(`PUBLISHED`)로 처음 바꿀 때 `published_at` 기록, 초안으로 되돌리면 홈페이지에서 빠짐

## 5. 화면별 기획

### CM-03. 콘텐츠 유형 · 칸 (T-255)
- 목록: 유형 이름 · 키 · 항목 수(공개/전체) · 사용 위치 수 · 순서 끌기. 한도 `3 / 10` · 막힌 이유(스위치 · 요금제)
- 만들기: **시작용 유형 5개** — 서비스 소개(요약 · 대표 사진 · 가격 메모) · FAQ(질문=제목 · 답=본문) · 연혁(연도 · 월) · 팀/의료진(직책 · 전문 분야 · 사진) · 제품/고객사(로고 · 링크) — 또는 빈 유형
- 칸 편집: 게시판 '필드 관리' 화면과 같은 모양(종류 · 필수 · 안내 문구 · 선택지 · 순서). 기본 칸(제목 · 요약 · 본문 · 대표 사진 · 카테고리 · 태그)은 항상 있음
- 지우기: 항목이 있으면 막고 수를 안내, 섹션에서 쓰는 중이면 사용 위치를 보여 주고 막음
- 구조 변경 기록: 칸 추가 · 수정 · 삭제를 감사 로그(`CONTENT_TYPE_UPDATED`)에 남김 — 와이어프레임 '스키마 변경 이력'

**화면 구현 (T-255):** `/admin/contents/types` 목록 · 추가 창, `/admin/contents/types/{id}` 기본 정보 + 칸 편집기(목록 전체 저장, 위/아래로 순서). 메뉴 '콘텐츠 관리'는 하위 메뉴를 태스크마다 더한다(T-255 유형 → T-256 목록 · 작성 → T-257 카테고리 · 태그).

**서버 구현 (T-253):** `/contents/types` — 칸은 목록 전체를 `PUT /contents/types/{id}/fields` 로 저장(목록 순서, 빠진 칸은 휴지통이고 그 키는 다시 못 씀, 있던 칸 키 고정). 값이 있는 칸의 종류 · 고른 값이 있는 선택지는 못 바꿈(409, 휴지통 항목 포함). 칸 종류는 게시판과 같고 별점만 뺌, 유형당 20칸. 시작용 유형 정의는 서버 `content_presets.CONTENT_PRESETS`. 지운 유형은 `POST /contents/types/{id}/restore`(한도 안에서).

### CM-01. 콘텐츠 목록 (T-256)
- 칸: 제목 · 유형 · 카테고리 · 상태(초안/공개) · 사용 위치 · 수정일
- 위: 상태별 수(전체 · 공개 · 초안), 검색(제목 · 요약), 유형 · 상태 · 카테고리 · 태그 필터, 휴지통 탭
- 행 작업: 수정 · 복제(초안으로) · 공개/초안 바꾸기 · 휴지통. 여러 개 골라 공개 · 초안 · 휴지통
- 지울 때 이 항목을 보여 주는 섹션(사용 위치)이 있으면 안내 (와이어프레임 '연결된 페이지 영향 안내')
- 유형 안에서 순서 끌기 (섹션의 '정해 둔 순서' 정렬에 씀)

### CM-02. 콘텐츠 작성 · 수정 (T-256 · T-259)
- 유형 고르기 → 그 유형 칸으로 입력 화면. 제목 · 요약 · 본문(Tiptap) · 대표 사진 · 카테고리 · 태그(입력하며 고르기 · 새로 만들기) + 유형 칸
- 버튼: [초안 저장] · [공개] (공개 중이면 [저장] · [초안으로 돌리기]). 나가기 전 저장 안 한 내용 확인
- 자동 임시저장: 브라우저에만 (localStorage, 저장하면 지움) — 서버 버전 기록은 후속(CM-07 과 함께)
- 입력 검사: 서버 400 `VALIDATION_ERROR` 의 `field` 를 그 칸에 표시
- AI (T-259): [✨ 문장 다듬기] 요약 · 본문 문단 → 서랍에서 비교 후 고른 것만 채움

**서버 구현 (T-254):** `/contents/items` — 초안은 필수 칸 없이 저장, 공개 · 공개 상태 수정 때 필수 칸 검사. 처음 공개 시각(`published_at`)은 초안으로 되돌려도 남김. 여러 개 공개는 필수 칸이 빈 항목을 건너뛰고 `skipped` 로 알림. 태그는 항목 저장 때 이름 목록으로 받아 없으면 만든다. 콘텐츠 사진(대표 · 본문 · 칸)은 안 쓰는 사진 정리에서 빠진다(휴지통 포함).

**화면 구현 (T-256):** 목록 `/admin/contents`(상태 탭 · 검색 · 유형 `?type=` · 카테고리 · 태그 · 여러 개 · 유형을 고르면 끌어서 순서), 작성 · 수정 `/admin/contents/new?type=` · `/admin/contents/{id}` — 유형 칸 입력은 게시글 칸 입력을 함께 쓴다. 대표 사진은 게시글 사진과 같은 업로드 위치(`board`). 사용 위치 칸은 T-258.

### CM-05. 카테고리 · 태그 (T-257 · T-259)
- 카테고리: 유형을 고르고 2단계 트리(끌어서 순서 · 하위로), 이름 바꾸기, 지울 때 그 카테고리 항목을 '다른 카테고리로 옮기기 / 카테고리 없음' 고르기
- 태그: 사업체 공통 목록(쓰는 항목 수), 이름 바꾸기, **합치기**(골라서 하나로 — 항목 연결을 옮기고 나머지는 지움), 같은 이름(띄어쓰기 · 대소문자 무시) 막기
- AI (T-259): 작성 화면 [✨ 태그 추천] — 있는 태그를 먼저, 새 태그는 표시해서 제안

**화면 구현 (T-257):** `/admin/contents/taxonomy` — 카테고리는 끌기 대신 위/아래 · 하위로 · 맨 위로 버튼(두 단계를 키보드로도 정확히), 바꿀 때마다 트리 전체 저장. 태그는 두 개 이상 골라 남길 태그를 정해 합친다. AI 태그 추천은 T-259.

### 콘텐츠 연결 섹션 (T-258)
- 섹션 추가 목록에 '콘텐츠 연결'(`CONTENT_LIST`, 테마형 템플릿). 설정: 유형 · 카테고리 · 태그 · 정렬(정해 둔 순서 · 최신 공개순 · 제목순) · 개수(3~24) · 보여 주는 방식(카드 · 목록 · FAQ 아코디언 · 연혁 · 로고 줄) · 빈 결과 문구
- 칸 매핑: 카드 제목 ← 제목, 설명 ← 요약, 사진 ← 대표 사진, 보조 글 ← 고른 유형 칸 1개 (연혁은 연도 칸)
- 공개 API `GET /api/public/site/{slug}/content-types/{type_id}/items?category=&tag=&sort=&limit=` — 공개 항목만, 유형 없음 · 지움 · 스위치 꺼짐 404
- 항목 상세 페이지는 만들지 않는다 (콘텐츠는 섹션으로만 보임). 카드 링크는 항목의 '링크' 칸이 있을 때만
- 사용 위치 `GET /contents/types/{id}/usage` · `GET /contents/items/{id}/usage` — 유형 · 카테고리 · 태그로 걸리는 섹션
- 미리보기: 섹션 [미리보기]는 초안 항목도 보여 줌(관리자만, T-244 미리보기 토큰)

**구현 (T-258):** 공개 API 는 `GET /api/public/site/{slug}/content-types/{type_id}/items` — 섹션이 유형 id 를 저장하므로 키 대신 id. 칸 값은 게시판 공개 칸과 같은 모양(`field_type`, 고르기 칸은 이름). 사용 위치는 콘텐츠 목록 칸 대신 휴지통 확인 창 · 편집 화면 아래에. 섹션이 쓰는 유형은 지울 수 없다(409). 미리보기의 초안 콘텐츠는 아직 — 미리보기도 공개 콘텐츠만.

### CM-04. 공통 블록 (T-260)
- 섹션 하나의 설정을 '공통 블록'으로 저장 → 다른 페이지에서 섹션 추가 시 [공통 블록에서]
- **참조형:** 섹션이 블록을 가리킴 — 블록을 고치면 쓰는 모든 섹션이 바뀜, 섹션 편집 화면은 "공통 블록 — N곳에서 사용 중" 안내와 [블록 편집] · [연결 끊고 이 섹션만 고치기]
- **복사형:** 값만 복사, 이후 따로
- 블록 목록: 이름 · 섹션 종류 · 사용 위치. 사용 중이면 지우기 막음(사용 위치 안내)
- 템플릿이 그릴 수 없는 종류의 블록은 고를 수 없음

## 6. API (`/api/v1`, 공통 응답 규격, 모두 `CONTENT_MANAGE` 스위치 · `get_db_with_rls`)

| 메서드 | 경로 | 내용 |
|---|---|---|
| GET · POST | `/contents/types` | 유형 목록(한도 · 스위치 포함) · 만들기(`preset_key` 가능) |
| GET · PATCH · DELETE | `/contents/types/{id}` | 유형 · 칸 정의 |
| PUT | `/contents/types/{id}/fields` · `/contents/types/order` | 칸 전체 저장 · 유형 순서 |
| GET · POST | `/contents/items` | 목록(검색 · 필터 · 상태별 수 · 휴지통) · 만들기 |
| GET · PATCH · DELETE | `/contents/items/{id}` | 항목 · 휴지통으로 |
| POST | `/contents/items/{id}/restore` · `/duplicate` · `/contents/items/bulk` · `/contents/items/order` | 복구 · 복제 · 여러 개 상태/휴지통 · 순서 |
| GET · POST · PUT · PATCH · DELETE | `/contents/types/{id}/categories` · `…/categories/tree`(끌어서 바꾼 트리 전체) · `/contents/categories/{id}`(DELETE `?move_to=`) | 카테고리 |
| GET · POST · PATCH · DELETE | `/contents/tags` · `/contents/tags/{id}` · POST `/contents/tags/merge` | 태그 |
| GET | `/contents/types/{id}/usage` · `/contents/items/{id}/usage` | 사용 위치 |
| (T-260) | `/contents/blocks` … | 공통 블록 |

**에러:** 스위치 꺼짐 · 보기 전용 쓰기 403, 한도 422 `PLAN_LIMIT_EXCEEDED`(유형 만들기 · 복구), 키 중복 409 (`field: type_key`), 다른 사업체 404, 칸 값 400 (`field: data.{칸}`).

## 7. 수용 기준

1. 스위치를 켠 STANDARD 사업체가 유형을 만들고(시작용 · 빈 유형) 칸을 정할 수 있다. FREE · BASIC 은 422 와 업그레이드 안내
2. 유형 칸대로 항목을 쓰고, 필수 · 종류가 틀리면 서버가 막고 그 칸에 이유를 보여 준다
3. 초안 항목은 홈페이지에 안 나오고, 공개로 바꾸면 '콘텐츠 연결' 섹션에 바로 나온다 (사이트 캐시 비움)
4. 목록에서 검색 · 유형 · 상태 · 카테고리 · 태그로 찾고, 복제 · 여러 개 공개 · 휴지통 · 복구가 된다
5. 카테고리 2단계, 지울 때 항목 옮기기. 태그 합치기 뒤 항목 연결이 옮겨진다
6. 섹션에서 쓰는 유형 · 항목을 지우려 하면 사용 위치를 안내한다
7. 다른 사업체 유형 · 항목 · 태그를 읽거나 고칠 수 없다 (RLS)
8. 보기 전용은 읽기만, 스위치를 끄면 메뉴가 사라지고 API 403, 홈페이지 섹션은 빈 상태(관리자에게만 안내)
9. 기존 콘텐츠형 게시판 · 게시판 연결 섹션 · 게시글 관리 필터가 그대로 동작한다
10. AI 결과는 사용자가 고르기 전에는 저장되지 않는다
11. 공통 블록(참조형)을 고치면 쓰는 모든 섹션이 바뀌고, 사용 중인 블록은 지울 수 없다

## 8. PR 단위 (TASK.md Phase 23)

| 태스크 | 범위 | 머지 전 확인 |
|---|---|---|
| T-253 | 백엔드: 0064 표 전부 · 유형 · 칸 API · 스위치 · 한도 · 시작용 유형 정의 | **DB 변경** |
| T-254 | 백엔드: 항목 · 카테고리 · 태그 API, 칸 값 검사, 휴지통 · 복제 · 여러 개 · 순서, 사용 위치 틀 | |
| T-255 | 관리자: '콘텐츠 관리' 메뉴 · 유형 · 칸 화면 (CM-03) | **메뉴 추가** |
| T-256 | 관리자: 콘텐츠 목록 · 작성 · 수정 (CM-01 · 02) | |
| T-257 | 관리자: 카테고리 · 태그 화면 (CM-05) | |
| T-258 | 홈페이지 · 백엔드: '콘텐츠 연결' 섹션(테마형) · 공개 API · 사용 위치 · 미리보기 | |
| T-259 | AI: 문장 다듬기 · 태그 추천 (`/ai/assist/content_polish` · `content_tags`) | |
| T-260 | 공통 블록 (CM-04) — 0065 `content_blocks` · `sections.block_id` | **DB 변경** |

끝나면 이 문서 기준으로 점검(`docs/03-analysis/content-management.analysis.md`) → 완료 보고서.
