# 디자인 목업 (Design Mockups)

앱 빌드와 분리된 **독립 HTML/CSS/JS 프로토타입** 작업 공간입니다.
실제 앱(`apps/*`)에 영향을 주지 않고 빠르게 디자인 시안을 만들고 비교한 뒤,
확정되면 Next.js / React 컴포넌트로 이식합니다. (bkit phase-3-mockup 방식)

## 규칙

- 파일은 단일 HTML로 작성 (CSS/JS 인라인 또는 같은 폴더). 브라우저로 바로 열람 가능해야 함.
- 시안 비교가 필요하면 `-a`, `-b` 접미사로 변형 생성 (예: `hero-sample-a.html`).
- 디자인 토큰(색/폰트/간격)은 가급적 실제 Tailwind 설정과 맞춰 이식 비용을 줄인다.
- 목업은 **버릴 수 있는 코드**다. 여기서 테스트/검증 규칙(CLAUDE.md 12장)은 적용하지 않는다.
- 확정된 시안은 해당 앱으로 이식 후, 대응 컴포넌트 경로를 아래 "이식 현황"에 기록.

## client 이식 규칙 (중요)

`client`의 템플릿 = **① CSS 변수 토큰 세트 + ② 섹션 순서**. 템플릿마다 새 Next.js 페이지를
만드는 게 아니다. 따라서 목업은 **순수 HTML**로 만들되 다음을 지킨다.

- `:root` 변수 키는 `apps/client/lib/theme.ts`의 `KEY_MAP`과 동일하게 사용
  (`primary`, `accent`, `font_heading`, `border_radius` 등) → 그대로 `TemplateTheme.cssVariables`로 이식
- 화면은 기존 섹션 어휘로 구성: `HERO_BANNER` `INTRO` `SERVICES` `TEAM` `CONTACT` `MAP` `GALLERY`
  (대응 컴포넌트: `apps/client/components/sections/*`)
- **이름 규칙**: partial 파일명 = SCSS 파일명 = BEM 블록명 = JS 파일명 (콘텐츠 기준 이름)

  | 섹션 (블록) | 내용 | CMS 기본 매핑 |
  |---|---|---|
  | `hero-slider` | 전체 화면 비주얼 슬라이드 + 카피 + CTA | `HERO_BANNER` |
  | `brand-intro` | 브랜드 소개 + 이미지 갤러리 + 대표 서비스 3종 | `INTRO` |
  | `service-cards` | 섹션 헤더 + 이미지 카드 목록 | `SERVICES` |
  | `video-playlist` | 대표 영상 + 영상 목록 | 신규 (`data-new`) |
  | `notice` | 최신 공지 목록 | 신규 (`data-new`) |
  | `location` | 제목 + 지도 + 방문 정보 (서브 `about-location.html` 에서 사용) | `MAP` |

- **클래스는 BEM** `.block__element--modifier`. 상태도 modifier (`.header--scrolled`, `.header__nav--open`).
  공통 제목 블록: `.section-head` > `__eyebrow` · `__title` · `__desc` (`_base.scss`)
- **시맨틱·접근성**: 목록은 `ul > li`, 섹션은 `aria-labelledby` 로 제목 연결, 로고만 `h1`(섹션 제목은 `h2`),
  장식 이미지는 `alt=""`, 의미 있는 이미지는 대체텍스트, 링크·버튼에 `focus-visible` 링,
  본문 바로가기(`.skip-link`), 스크린리더 전용 텍스트는 `.sr-only`
- 샘플 문구는 어느 업종에서도 자연스러운 카피 (가상 브랜드 `BAZZAR`)
- 기존 섹션으로 표현 안 되는 특정 업종 전용 레이아웃은 `data-new="true"`로 표시 → 새 섹션 컴포넌트 추가 대상
- 이식 산출물: `apps/client/lib/templates/<key>.ts` (+ 백엔드 `seed.py` 동일 값) / 필요 시 새 섹션 컴포넌트

## 폴더 구조

```
docs/mockups/
  hospital/
    templates/                 ← 시안 HTML을 여기서 관리 (앞으로 여러개)
      _template.html           ← 메인 페이지 스캐폴드 (data-include 목록만, 로컬 서버로 열기)
      _sub-template.html       ← 서브 페이지 스캐폴드 (복사해서 about.html 등으로, 같은 폴더에)
      about.html               ← 서브: 브랜드 소개
      about-history.html       ← 서브: 연혁
      about-location.html      ← 서브: 오시는 길 (sections/location 재사용)
      business.html            ← 서브: 사업 소개 (헤더 Business 메뉴, 하위 탭 없음)
      notice.html notice-view.html ← 서브: 공지사항 목록 / 상세 (헤더 Notice 메뉴)
      consult.html consult-view.html consult-write.html reservation.html ← 서브: 온라인 상담 목록 / 상세 / 글쓰기 / 온라인 예약 신청 (헤더 상담 예약 메뉴, 탭 sub-nav-consult)
      login.html join.html join-social.html find-email.html find-pw.html reset-pw.html mypage.html withdraw.html
                               ← 회원 (기획서 16): 로그인 / 회원가입 / 소셜 가입 추가 정보 / 이메일 찾기 / 비밀번호 찾기 / 새 비밀번호 / 마이페이지 / 회원 탈퇴
                                 목업 계정 hong@email.com / bazzar1234 · 인증번호 123456 · 상태 보기 reset-pw.html#expired, withdraw.html#reservation, join-social.html#naver
      components/              ← HTML partial (컴포넌트)
        header.html footer.html quick-menu.html (퀵메뉴·간편상담·상단으로, 모든 페이지 footer 다음)
        sub/                   ← 서브 페이지 공통 partial
          sub-hero.html (비주얼+제목+브레드크럼) sub-nav.html (탭) sub-nav-consult.html (상담 예약 탭)
          media-row.html (사진+글) strength-list.html (체크리스트+사진) area-rows.html (지그재그)
          photo-gallery.html (사진 슬라이드+썸네일) consult-links.html (상담 버튼 3종)
          history-timeline.html (연혁: 구간 탭 + 고정 연도·사진 + 월별 목록)
          split-story.html split-story-reverse.html (글 | 사진 2단, 반전) milestone-split.html (제목·사진 | 사진·주요 연도)
          banner-split.html (글 | 오른쪽 꽉 찬 사진) criteria-cards.html (제목·설명 + 사진 카드 3개)
          value-circles.html (배경 사진 + 원형 가치 3개 + 더보기) ← 공통 글 블록 .story-text 사용
          board-list.html (게시판 목록: 총 건수·검색·공지 배지·페이지 이동) board-view.html (게시판 상세: 본문 + 이전/목록/다음)
          consult-board.html (상담 목록 표: 비밀글·답변여부 + 글쓰기) consult-view.html (상담 상세: board-view + 작성자·답변 박스) consult-write.html (상담 글쓰기 폼 + 취소/등록) reserve-form.html (예약 신청 폼 + 등록)
          login-form.html join-form.html join-social-form.html find-email-form.html find-pw-form.html reset-pw-form.html withdraw-form.html (회원: .board-form + 전용 .member-form)
          member-sns.html (카카오·네이버 + 또는) member-agree.html (약관 동의) phone-verify.html (휴대폰 인증) password-field.html (비밀번호 + 보기 + 조건) find-tabs.html (찾기 탭)
          mypage.html (마이페이지 탭: 내 예약 · 문의 내역 · 알림 설정 · 내 정보 → .mypage)
          ← 게시판 공용 블록: .board-toolbar (총 건수 | 검색), .pagination (페이지 이동), .board-form (입력 폼 패널)
        sections/              ← 섹션별 partial (레이아웃 패턴 이름)
          hero-slider.html brand-intro.html service-cards.html video-playlist.html notice.html location.html
      clinic-a.html            ← (예) 개별 시안
      assets/
        js/include.js          ← data-include partial 로더 (완료 시 'includes:loaded' 이벤트)
        js/header.js quick-menu.js sub-nav.js photo-gallery.js history-timeline.js board-search.js board-form.js member-form.js mypage.js ← 헤더·퀵메뉴(공통), 서브 탭·갤러리·연혁·게시판 검색(공용)·입력 폼 검증(공용)·회원(이메일 중복·휴대폰 인증·로그인 잠금·찾기 단계·탈퇴)·마이페이지(탭·예약·알림·내 정보)
        js/hero-slider.js brand-intro.js service-cards.js video-playlist.js scroll-reveal.js ← 섹션별 동작 (Swiper·GSAP·YouTube)
        images/                ← 이미지·아이콘
        styles/                ← SCSS 소스
          _tokens.scss         ← 공통 토큰 (SCSS 변수 + :root + 브레이크포인트 값)
          _mixins.scss         ← 공통 믹스인 (반응형·레이아웃·타이포·유틸, tokens forward)
          _base.scss           ← 리셋·레이아웃·공용 컴포넌트(.btn/.card/.grid)
          header/_header.scss  ← GNB
          main/                ← 본문 섹션 (여기서 섹션별로 관리)
            _hero-slider.scss _brand-intro.scss _service-cards.scss _video-playlist.scss _notice.scss _location.scss
            (레이아웃 패턴 이름 — 업종 무관. 아래 '섹션 네이밍' 참고)
          footer/_footer.scss  ← Footer
          quick-menu/_quick-menu.scss ← 퀵메뉴·간편상담·상단으로 (공통)
          template.scss        ← 엔트리 (@use로 전부 조합) → 이것만 컴파일 (밑줄 없음)
        css/
          template.css         ← 컴파일 결과 (HTML이 참조, Live Sass Compiler 출력)
    _backup/                   ← 미사용 보관 (작업 대상 아님)
      plain/                   ← 이전 plain CSS 버전
      tailwind/                ← 미사용 Tailwind 버전 (백업)
```

### 컴포넌트 (HTML partial)

`_template.html` 은 `<div data-include="components/...html"></div>` 목록만 가진다.
섹션을 넣고·빼고·순서를 바꾸려면 이 목록만 수정한다. `include.js` 가 각 파일을 불러와
`data-include` 요소를 통째로 교체한다 (중첩 include 지원).

- **로컬 서버로 열어야 한다** (file:// 에서는 fetch 차단 → 안내 문구만 표시됨)
  - VSCode **Live Server** 확장 → `_template.html` 우클릭 → *Open with Live Server*
  - 또는 `npx serve docs/mockups/hospital/templates`
- partial 안의 이미지 경로는 **페이지 기준** (`./assets/images/...`)
- 컴포넌트 DOM 이 필요한 스크립트는 `document.addEventListener('includes:loaded', ...)` 안에서 실행
- 이식 시 1:1 대응: `components/sections/service-cards.html` → `sections/ServiceCards.tsx`

### 서브 페이지

- **위치: `templates/` 루트 (메인 `_template.html` 과 같은 폴더)**. 파일명으로 구분한다.
  `about.html`, `about-history.html`, `services.html` …
  - 하위 폴더(`pages/`)에 두면 partial 의 상대경로(`./assets/…`, `components/…`)가 깨진다.
  - `<base href="../">` 로 우회하면 `#main` 같은 앵커가 메인 페이지로 이동해버려 쓰지 않는다.
- `_sub-template.html` 을 복사해서 `<title>`, sub-hero 의 data 값, sub-nav 의 `data-current`, 본문만 바꾼다.
- partial 에 값 전달: include 요소의 `data-*` → partial 안의 `{{camelCase키}}` 로 치환 (`include.js`)
  ```html
  <div data-include="components/sub/sub-hero.html" data-page-title="브랜드 소개" data-eyebrow="About"
       data-category="About" data-image="./assets/images/head_slide1.jpg"></div>
  ```
- 이식 시: `about.html` → `apps/client/app/[tenant_slug]/about/page.tsx`

### SCSS 컴파일

VSCode **Live Sass Compiler** 의 "Watch Sass" 사용 (전역 설정 `savePath: ~/../css`).
→ `assets/styles/template.scss` 저장 시 `assets/css/template.css` 로 자동 출력. 브라우저는 새로고침.

수동 컴파일:
```bash
cd docs/mockups/hospital/templates
npx sass --watch assets/styles/template.scss assets/css/template.css
```

- 엔트리 `template.scss`(밑줄 없음)만 컴파일 대상. `_` 로 시작하는 partial 은 직접 컴파일 안 됨.

### 새 영역(섹션) 스타일 추가

```scss
// 1) main/_새영역.scss 생성
@use '../mixins' as *; // 믹스인 + 토큰 변수
.새영역 { ... }
```
```scss
// 2) assets/styles/template.scss 에 한 줄 추가
@use 'main/새영역';
```

### 시안 복제 (새 시안 만들 때)

```bash
cd docs/mockups/hospital/templates
cp _template.html clinic-a.html
# 시안마다 스타일을 분리하려면 scss도 함께 복제 후 컴파일
cp assets/styles/template.scss assets/styles/clinic-a.scss
npx sass assets/styles/clinic-a.scss assets/css/clinic-a.css
# → clinic-a.html 의 <link> 를 assets/css/clinic-a.css 로 변경
```

## 파일 목록

| 파일 | 대상 화면 | 상태 | 이식 경로 |
|---|---|---|---|
| hospital/templates/_template.html | 병원 템플릿 기본 스캐폴드 | 작업중 | - |

## 이식 현황

- _(아직 없음)_

## 반응형 기준

- 모바일 퍼스트. 브레이크포인트: `sm 480` · `md 768` · `lg 1024` · `xl 1280` (`@include md { … }`)
- `.container` 는 좌우 여백 `--spacing-gutter` (모바일 20px / md 이상 40px) 을 뺀 폭, 최대 1640px
- 큰 제목은 `@include fluid-type(최소, 최대)` 로 화면 폭에 맞춰 자동 축소
- 헤더 메뉴: lg 미만은 햄버거 → 드롭다운 (링크 클릭·Esc 로 닫힘)
- service-cards: lg 이상 5단 그리드, lg 미만 슬라이드 (`service-cards.js`, 넓어지면 Swiper 해제)
- 연혁: lg 미만은 왼쪽 고정 연도 대신 연도 제목이 목록 안에 보임
- 퀵메뉴: md 이상 오른쪽 아래 세로 버튼(퀵메뉴 펼침·간편상담 패널·상단으로), md 미만 하단 고정 바 + 작은 상단으로 버튼, 간편상담은 바텀 시트
