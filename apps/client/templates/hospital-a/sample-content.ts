import type { SampleContent } from '../shared/contracts'
import sample from './sample-content.json'

/**
 * hospital-a 샘플 콘텐츠 (기획서 11.8) — 목업 문구·이미지 그대로.
 *
 * 원본은 sample-content.json 하나다. 백엔드 시드가 같은 파일 복사본
 * (apps/backend/app/data/templates/TPL_HOSPITAL_A.json)을 templates.sample_content 로 동기화하고,
 * 두 파일이 다르면 테스트가 실패한다 (tests/test_seed_templates.py).
 *
 * - 처음 템플릿을 적용하거나 테넌트를 만들 때 이 값이 테넌트 섹션으로 복사된다 (is_sample=true)
 * - 이미지는 공용 경로 /templates/{key}/{version}/ — 고객이 바꾸면 테넌트 경로로 새로 올라간다
 * - VIDEO_PLAYLIST.videos[].video_id 가 'VIDEO_ID_' 로 시작하면 샘플 (실제 ID 면 유튜브 썸네일 사용)
 * - NOTICE_LATEST.items 는 공지 데이터를 섹션 JSON 에 둔다 (오픈 이슈 #27)
 */
// JSON import 는 섹션 타입·설정 키를 좁게 추론하므로 계약 타입으로 넓힌다 (값 검증은 테스트)
export const hospitalASample = sample as unknown as SampleContent
