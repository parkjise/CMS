import type { TemplateManifest } from '@cms/types'

/**
 * hospital-a — 디자인 목업(docs/mockups/hospital/templates) 이식 템플릿 (기획서 11.7)
 * 이름·ID 는 오픈 이슈 #25 결정: TPL_HOSPITAL_A
 *
 * css_variables 는 색상·폰트·모서리만 둔다 (theme.ts 짧은 키).
 * 화면 폭에 따라 바뀌는 간격 토큰(--spacing-gutter 등)은 styles/_tokens.scss 에만 둔다
 * — 여기 넣으면 미디어쿼리 값을 덮어쓴다.
 */
export const hospitalAManifest: TemplateManifest = {
  key: 'hospital-a',
  id: 'TPL_HOSPITAL_A',
  name: '하스피털 A',
  renderer: 'code',
  styling: 'scss',
  version: '1.0.0',
  pages: [
    {
      key: 'home',
      title: '홈',
      menu: 'none',
      default_sections: ['HERO_SLIDER', 'INTRO', 'SERVICES', 'VIDEO_PLAYLIST', 'NOTICE_LATEST'],
    },
    // 서브 페이지 화면은 T-122 · T-123 에서 구현 — 메뉴 순서·이름만 먼저 정의
    { key: 'about', title: '회사소개', menu: 'gnb', default_sections: [] },
    { key: 'about-history', title: '연혁', menu: 'sub', parent: 'about', default_sections: [] },
    { key: 'about-location', title: '오시는 길', menu: 'sub', parent: 'about', default_sections: [] },
    { key: 'business', title: '사업영역', menu: 'gnb', default_sections: [] },
    { key: 'notice', title: '공지사항', menu: 'gnb', default_sections: [] },
    { key: 'consult', title: '상담·예약', menu: 'gnb', default_sections: [] },
  ],
  sections: ['HERO_SLIDER', 'INTRO', 'SERVICES', 'VIDEO_PLAYLIST', 'NOTICE_LATEST'],
  css_variables: {
    primary: '#0ea5a0',
    primary_hover: '#0c8a86',
    on_primary: '#ffffff',
    secondary: '#e8f6f5',
    accent: '#f59e0b',
    background: '#ffffff',
    surface: '#f8fafc',
    text_primary: '#333333',
    text_secondary: '#475569',
    border: '#e2e8f0',
    font_heading: "'Pretendard', system-ui, sans-serif",
    font_body: "'Pretendard', system-ui, sans-serif",
    border_radius_base: '10px',
    border_radius_card: '16px',
  },
}
