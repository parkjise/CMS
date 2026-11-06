# Oliva Casa — Italian Table Mockup

올리바 카사(Oliva Casa) 목업 퍼블리싱 페이지입니다.

## 미리보기 (Preview)

- 로컬 서버 주소: `http://localhost:8080/hospital/oliva/index.html` (또는 라이브 서버 활용)
- HTML partials는 `fetch`를 사용하므로 `file://` 대신 HTTP 로컬 서버 환경에서 실행해야 합니다.
- **반응형 지원**: 데스크톱(1600px~)부터 태블릿(820px~1180px), 모바일(320px~640px)까지 완벽 반응형 최적화

## 구조 (Structure)

- `index.html`: 섹션 인클루드 및 메타 설정
- `components/`: 재사용 모듈형 HTML 컴포넌트
  - `header.html`: 상단 네비게이션 및 브랜드
  - `footer.html`: 하단 시그니처 및 법적 정보
  - `sections/`: 개별 섹션 (hero, daily-service, philosophy, signature-menu, handmade-story, seasonal-table, wine-selection, space-gallery, guest-review, reservation, location)
- `assets/styles/`:
  - `_tokens.scss`: 색상, 폰트, 반응형 토큰
  - `_mixins.scss`: 공통 믹스인
  - `_reset.scss`: CSS 리셋
  - `_base.scss`: 기본 레이아웃 및 공통 버튼/타이포그래피
  - `_header.scss`, `_footer.scss`: 반응형 헤더/푸터
  - `main/_*.scss`: 각 섹션별 반응형 BEM 스타일
  - `template.scss`: 전체 SCSS 통합 엔트리
- `assets/css/template.css`: 컴파일된 최종 CSS
- `assets/js/`:
  - `include.js`: `data-include` 비동기 컴포넌트 로더
  - `main.js`: 네비게이션 스크롤, 예약 안내 팝업 및 외부 지도 연결

## SCSS 빌드 명령어

```sh
npx sass docs/mockups/hospital/oliva/assets/styles/template.scss docs/mockups/hospital/oliva/assets/css/template.css
```
