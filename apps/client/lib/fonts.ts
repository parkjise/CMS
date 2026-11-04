import '@fontsource/noto-sans-kr/400.css'
import '@fontsource/noto-sans-kr/700.css'

/**
 * 테마형 템플릿 · 공통 화면 글꼴 (T-125).
 * 한글 글꼴은 글리프 구간별 @font-face 가 많아 화면 표시를 막는 CSS 가 커진다.
 * 루트 레이아웃이 아니라 이 글꼴을 쓰는 라우트에서만 불러온다 — 코드형 템플릿(/tpl-*)은 자체 글꼴 사용.
 *
 * next/font/google 은 빌드 때 구글에서 내려받아, 구글이 확장자 없는 글꼴 주소를 주면
 * 빌드가 실패한다 — 패키지로 묶어 빌드가 외부에 의존하지 않게 한다 (T-135).
 */
