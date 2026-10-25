import type { SampleContent } from '../shared/contracts'

/**
 * hospital-a 샘플 콘텐츠 (기획서 11.8) — 목업 문구·이미지 그대로.
 * 처음 템플릿을 적용하면 이 값이 테넌트 섹션으로 복사된다 (T-120).
 * 그 전까지는 테넌트에 없는 섹션·빈 값을 이 샘플로 채워 보여준다 (resolvePageSections).
 *
 * 이미지는 공용 경로 /templates/{key}/{version}/ — 고객이 바꾸면 테넌트 경로로 새로 올라간다.
 */
const IMG = '/templates/hospital-a/1.0.0'

export const hospitalASample: SampleContent = {
  version: '1.0.0',
  site: {
    brand_name: 'BAZZAR',
    logo_url: `${IMG}/logo.svg`,
    phone: '02-1234-5678',
    kakao_url: '#',
    hours_weekday: '오전 10:00 - 오후 7:00',
    hours_saturday: '오전 10:00 - 오후 4:00',
    hours_note: '일요일 · 공휴일 휴무',
    address: '서울특별시 강남구 테헤란로 123, 4층',
    naver_map_url: '#',
    kakao_map_url: '#',
    tmap_url: '#',
    parking: '건물 내 주차 2시간 무료 · 발렛 서비스 가능',
    ceo: '김온도',
    business_number: '123-45-67890',
    terms_url: '#',
    privacy_url: '#',
  },
  pages: {
    home: [
      {
        section_type: 'HERO_SLIDER',
        label: '메인 비주얼',
        settings: {
          slides: [
            {
              image_url: `${IMG}/head_slide2.jpg`,
              title: '당신의 하루에 알맞은 온도',
              copy_primary: 'Warm Moments',
              copy_secondary: 'Crafted with Care',
            },
            {
              image_url: `${IMG}/head_slide1.jpg`,
              title: '오래 머물고 싶은 경험을 설계합니다',
              copy_primary: 'Timeless Value',
              copy_secondary: 'Designed to Last',
            },
            {
              image_url: `${IMG}/head_slide3.jpg`,
              title: '작은 차이가 만드는 깊은 신뢰',
              copy_primary: 'Quiet Confidence',
              copy_secondary: 'In Every Detail',
            },
          ],
        },
      },
      {
        section_type: 'INTRO',
        label: '브랜드 소개',
        settings: {
          title: 'Every Detail\nBegins with You',
          description:
            '보이지 않는 곳까지 세심하게. 머무는 모든 순간이 특별해지도록 BAZZAR가 먼저 생각합니다.',
          gallery: [
            { image_url: `${IMG}/proj1.jpg`, alt: '브랜드 대표 이미지 1' },
            { image_url: `${IMG}/proj2.jpg`, alt: '브랜드 대표 이미지 2' },
            { image_url: `${IMG}/proj3.jpg`, alt: '브랜드 대표 이미지 3' },
          ],
          signature_title: 'BAZZAR\nSIGNATURE',
          signature_desc: '365일, 처음과 같은 마음으로.',
          features: [
            { name: '맞춤 컨설팅', name_en: 'Personal Consulting', icon_url: `${IMG}/icon-01.svg`, link_url: '#' },
            { name: '프리미엄 케어', name_en: 'Premium Care', icon_url: `${IMG}/icon-02.svg`, link_url: '#' },
            { name: '멤버십 혜택', name_en: 'Membership Benefits', icon_url: `${IMG}/icon-03.svg`, link_url: '#' },
          ],
        },
      },
      {
        section_type: 'SERVICES',
        label: '서비스',
        settings: {
          eyebrow: 'Our Expertise',
          title: '한 분야에 깊이 집중해 온 시간,\n그 시간이 곧 신뢰가 됩니다.',
          description: '처음 만나는 순간부터 그 이후까지, 가장 가까운 곳에서 함께하겠습니다.',
          cards: [
            { image_url: `${IMG}/card1.avif`, eyebrow: 'Signature', title: '시그니처', description: 'BAZZAR만의 프로그램', link_url: '#' },
            { image_url: `${IMG}/card2.avif`, eyebrow: 'Consulting', title: '1:1 컨설팅', description: '목표에 꼭 맞춘 맞춤형 제안', link_url: '#' },
            { image_url: `${IMG}/card3.avif`, eyebrow: 'Premium', title: '프리미엄', description: '한 단계 높은 경험을 위한 선택', link_url: '#' },
            { image_url: `${IMG}/card4.avif`, eyebrow: 'Care', title: '케어 서비스', description: '세심한 관리로 완성되는 만족', link_url: '#' },
            { image_url: `${IMG}/card5.avif`, eyebrow: 'Membership', title: '멤버십', description: '오래 함께할수록 커지는 혜택', link_url: '#' },
          ],
        },
      },
      {
        section_type: 'VIDEO_PLAYLIST',
        label: '영상',
        settings: {
          eyebrow: 'BAZZAR Youtube',
          title: 'BAZZAR가 전하는 이야기,\n영상으로 만나보세요',
          description: '브랜드의 철학과 일상의 순간을 담은 공식 유튜브 채널',
          channel_url: 'https://www.youtube.com/@CHANNEL_HANDLE',
          // video_id 가 'VIDEO_ID_' 로 시작하면 샘플 — 실제 ID 면 유튜브 썸네일 자동 사용
          videos: [
            { video_id: 'VIDEO_ID_1', title: '브랜드 필름 — 당신의 하루에 알맞은 온도', duration: '2:48', thumb_url: `${IMG}/photo1.avif` },
            { video_id: 'VIDEO_ID_2', title: 'BAZZAR가 일하는 방식 — 보이지 않는 곳까지 세심하게', duration: '4:12', thumb_url: `${IMG}/photo2.avif` },
            { video_id: 'VIDEO_ID_3', title: '처음 방문하셨나요? 3분 만에 살펴보는 BAZZAR 이용 가이드', duration: '3:05', thumb_url: `${IMG}/photo3.avif` },
            { video_id: 'VIDEO_ID_4', title: '고객이 직접 전하는 이야기 | 다시 찾게 되는 이유', duration: '5:30', thumb_url: `${IMG}/photo4.avif` },
          ],
        },
      },
      {
        section_type: 'NOTICE_LATEST',
        label: '공지',
        settings: {
          title: 'NOTICE',
          description: 'BAZZAR의 새로운 소식과 안내를 가장 먼저 전해드립니다.',
          // 공지 데이터는 섹션 JSON (오픈 이슈 #27 — 별도 게시판 테이블은 이후)
          items: [
            { subject: '홈페이지 리뉴얼 오픈 안내', date: '2026-10-20' },
            { subject: '연말연시 운영 시간 안내', date: '2026-10-15' },
            { subject: '개인정보 처리방침 개정 안내', date: '2026-10-02' },
            { subject: '고객 만족도 조사 결과 안내', date: '2026-09-24' },
          ],
        },
      },
    ],
  },
}
