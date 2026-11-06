# 게시판 작업 — Codex 인수인계

작성: Codex / 2026-11-06 (Asia/Seoul)

## 최신 기록: T-154 전체 글 카테고리 필터 (Codex)

- 사용자 승인: T-154 제안 뒤 “진행해줘” 요청. 테마형 공지 페이지는 계속 스킵한다.
- PR: [#104](https://github.com/parkjise/CMS/pull/104). 생성 시점 미병합이며 CI 상태는 GitHub에서 확인한다.
- 브랜치: `codex/T-154-post-category`, 폴더: `/private/tmp/cms-T-154`, 기준 main: `1f4a9f6`.
- T-153 마무리: #101 · #102 · #103은 모두 MERGED. 최종 #103의 backend · frontend · e2e가 전부 통과했고, main에 보고서 · 인수인계 · T-153 커밋이 포함됐음을 확인했다. 병합 커밋은 `1f4a9f6`이다.
- API: `GET /api/v1/posts?category_id={UUID}`를 추가했다. 기존 사업체 · 게시판 · 상태 · 제목 · 휴지통 조건과 같은 WHERE 절을 사용해 목록과 total을 함께 좁힌다. 다른 사업체나 게시판의 분류는 글을 노출하지 않고, 잘못된 UUID는 입력 오류가 된다. DB 스키마 · 권한 정책 변경 없음.
- 화면: `PostsOverviewPage.tsx`에서 기존 `useBoardCategories`를 사용한다. 게시판 미선택 · 기본 게시판은 조회하지 않는다. 선택한 게시판의 숨김 포함 분류를 보여 주고, 로딩 · 실패 재시도 · 없음 안내를 구분한다.
- 게시판 변경 시 category_id를 비우고, 필터 변경 시 페이지 · 글 선택을 초기화한다. 이전 목록이 placeholder로 보이는 동안 체크박스를 비활성화해 필터 밖의 글을 다시 고르지 못하게 한다. 검색 · 상태 · 휴지통 조건은 함께 유지한다.
- 검증: 기존 테스트 전용 `cms_test_db`(마이그레이션 0045), 일반 앱 계정 RLS로 `tests/test_board_overview.py` 39개 통과(추가 5개). 백엔드 전체 app의 Ruff lint · format, mypy 174개 파일 통과. 관리자 전체 61개 파일 · 481개 시험(추가 6개) 통과, 타입 검사 · 빌드 통과, lint 오류 0(기존 react-refresh 경고 5건). 실제 브라우저 화면은 확인하지 않았다.
- 수정 파일: 관리자 화면 · 해당 테스트, 백엔드 엔드포인트 · 서비스 · 해당 테스트, BM-05/API 기획서, TASK, 이 문서.
- 후속: 카테고리 2단계 · 합치기, 목록 URL · 수정일 표시 등. 운영 전 백업 · 저장소 · 법률 확인 항목은 그대로 남아 있다.

## 이전 기록: T-153 게시판 목록 검색 (Codex)

- 사용자 지시: 테마형 공지 페이지 추가 제안은 스킵하고 다음 작업 진행. 공지 페이지는 이번에 구현하지 않았다.
- 작업 브랜치: `codex/T-153-board-search`, 작업 폴더: `/private/tmp/cms-T-153`.
- 기준 커밋: 인수인계 브랜치 `codex/board-handoff`의 `3c9d6ce`. 사용자 병합 요청 뒤 #101을 main에 병합했고, 최신 main(`7785cf6`)을 이 브랜치에 합쳤다. [PR #103](https://github.com/parkjise/CMS/pull/103)의 기준은 main이며 #102 인수인계 변경도 포함한다. 최신 head의 CI가 전부 통과하면 #103을 병합한다. 이후 #102의 커밋이 main에 포함됐는지 확인한다.
- 구현: `apps/admin/src/pages/BoardsPage.tsx`에 이름 부분 검색(공백 · 영문 대소문자 무시), 유형 · 상태 복합 필터, 전체/결과 수, 초기화, 검색 결과 없음 안내 추가. 기존 전체 목록 응답을 화면에서 필터링한다.
- 조건은 `q`, `type`, `status` URL 쿼리로 보존한다. 잘못된 유형 · 상태는 전체로 취급하고 다른 쿼리는 초기화 때 보존한다. 글쓰기 · 수정 바로가기는 검색 결과 대신 전체 게시판에서 대상을 찾아 기존 동작을 유지한다.
- 테스트: `boards.test.tsx`에 이름 · 복합 조건 · 4종 유형 · URL 복원/변경/초기화 · 보기 전용 · 결과 없음 · 글쓰기 바로가기 검증 추가. 해당 파일 32개 통과, 관리자 전체 61개 파일 · 475개 시험 통과(Node 25.2.1).
- 관리자 타입 검사 · 빌드 통과. lint 오류 0, 변경 밖 기존 react-refresh 경고 5건. 실제 브라우저 화면은 확인하지 않았다.
- BM-01 기획서와 TASK(T-153 · 전체 태스크 수 · 후속 후보)를 갱신했다. DB · 권한 정책 · API 변경 없음.
- 인수인계 PR #102의 frontend CI 실패를 발견해 로그 확인: 고객 홈페이지 `hospitalASubPages.test.tsx` 종료 뒤 `DeferredStylesheets.tsx`의 비동기 CSS 로딩이 `document is not defined`를 발생시킴. 734개 시험 자체는 통과했으나 미처리 오류 5건으로 job 실패. T-153 변경 전의 실행에서 발생했으며, 이번 관리자 검색 변경과 별개다. 해당 실패를 전체 CI 성공으로 기록하거나 재현 확인 없이 무시하지 않는다. 로그: https://github.com/parkjise/CMS/actions/runs/42198325573/job/127827080107
- 다음 후보: 전체 글의 분류 필터, 목록 URL · 수정일 표시 등. 테마형 공지는 사용자가 스킵했으므로 자동으로 다시 시작하지 않는다.

아래는 최초 인수인계 당시 기록이다. 현재 작업 내용은 위 최신 기록을 우선한다.

## 사용자 요청과 이번 범위

Claude가 사용량 제한으로 중단한 위치를 확인하고, 별도 브랜치에서 작업한 내용을 Claude가 알 수 있게 기록해 달라는 요청을 받았다. 이번 작업은 완료 보고서의 검증 표현 정리와 인수인계 문서 작성이다. 새로운 게시판 기능은 추가하지 않았다.

## 이어받은 상태

- 구현 마지막 PR: [#100 — T-152](https://github.com/parkjise/CMS/pull/100), 2026-11-06 16:01:42 KST main 병합.
- 구현 기준 main 커밋: `a8798e32f47f7c1c98b59d9d9bc9f7221b21d016`.
- Claude의 완료 보고서 PR: [#101](https://github.com/parkjise/CMS/pull/101), 브랜치 `docs/board-module-report`, 커밋 `8ef66b1306b87d2cd126ac88552d775f1bddf984`.
- GitHub 조회 시 #101은 OPEN, MERGEABLE / CLEAN이며 backend · frontend · e2e가 모두 SUCCESS였다. 이후 상태는 GitHub에서 다시 확인한다.
- Claude가 마지막에 말한 보고서 수정(T-152 화면 검증 표현, 실제 시험 범위)과 TASK의 T-152 PR #100 번호 반영은 이미 커밋에 들어 있다. 다시 구현할 필요 없다.

## Codex 작업

- 브랜치: `codex/board-handoff`.
- 기준: `docs/board-module-report`의 `8ef66b1`. 따라서 #101의 문서 변경도 이 브랜치의 이력에 포함된다.
- 작업 폴더: `/private/tmp/cms-codex-board-handoff` (임시 위치이므로 후속 작업 전 존재 여부 확인).
- `docs/04-report/board-module.report.md`: 요약 표에서도 T-152의 서버 시험과 화면 변경 PR의 화면 확인을 구분했다. 기존 시험 수치는 Claude의 기록이며 Codex가 재실행한 결과가 아님을 명시했다. 93% / 45% 일치율도 기존 분석 수치이며 재계산하지 않았음을 명시했다.
- `TASK.md`: 이 인수인계 문서 링크 추가.
- `CLAUDE.md`: 자주 참조하는 파일 표에 이 문서 링크 추가.
- 앱 코드 · DB · 로그인 · 권한 · 결제 · 배포 설정 변경 없음. 기획 동작 변경이 없어 기획서는 수정하지 않았다.

## 검증 범위

- Git 로그 · worktree · 변경 파일과 보고서, TASK, 게시판 기획서를 대조했다.
- GitHub에서 #100 병합과 #101의 세 CI 성공을 조회했다.
- 이번 문서 변경은 `git diff --check` 및 문서 연결 경로 · 수정 문구 검사로 확인한다.
- Codex는 전체 단위 시험, 빌드, 실제 브라우저 검증을 다시 수행하지 않았다. 기존 CI 성공을 새 인수인계 커밋의 CI 결과로 간주하지 않는다.

## Claude가 이어서 할 일

1. 원격 PR 상태와 `codex/board-handoff` 변경을 확인한다. #101이 먼저 병합됐다면 인수인계 PR의 기준을 main으로 바꾸고 CI를 확인한다.
2. 문서 PR을 CI 통과 후 정리한다. 이 문서는 병합 완료를 선언하는 기록이 아니다.
3. 새 기능은 TASK Phase 18의 후속 후보에서 사용자와 범위를 정하고 태스크 번호 · 플랜을 만든 뒤 시작한다. 신고 자동 숨김 정책, 테마형 공지 페이지 등이 후보이며 이번 요청에서 선택된 기능은 없다.
4. 오픈 전 항목(B5 백업, B6 저장소, 법률 확인 등)은 개발 완료와 별도로 남아 있다. 이번 문서 작업으로 완료 처리하지 않는다.

## 기존 폴더 주의사항

- `/Users/Js/Work/CMS`: `feat/hospital-template-popup`, `f099062`(PR #91 시점). 최신 main과 다르다.
- 기존 미추적 `.bkit/`, `docs/Corporate_Template_Plan_v0.1.md`는 사용자 작업일 수 있어 수정하거나 커밋하지 않았다.
- `/Users/Js/Work/cms-board-report`: Claude의 보고서 작업 폴더.
- `/Users/Js/Work/cms-main`: 확인 시 `a8798e3`의 detached HEAD.

이 경로와 PR 상태는 인수인계 시점의 관찰이다. 작업 시작 전 현재 상태를 다시 확인한다.
