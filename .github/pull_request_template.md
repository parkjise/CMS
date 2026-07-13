## 요약
<!-- 무엇을, 왜 변경했는지 1~3줄 -->

## 관련 태스크
<!-- 예: T-0XX / 이슈 링크 -->

## 변경 유형
- [ ] feat (새 기능)
- [ ] fix (버그 수정)
- [ ] refactor / test / docs / chore / infra

## 체크리스트 (CLAUDE.md 준수)
- [ ] 백엔드: `ruff check app/` + `ruff format --check app/` 통과
- [ ] 백엔드: `pytest` 통과 (커버리지 ≥ 70%)
- [ ] 프론트: `pnpm lint` + `pnpm -r type-check` + `pnpm -r test` 통과
- [ ] 관련 테스트 추가/수정
- [ ] TASK.md 해당 항목 업데이트 (필요 시)

## 검증 방법
<!-- 리뷰어가 재현/확인할 수 있는 절차 -->

## 참고
<!-- 스크린샷, 마이그레이션, 롤백 방법 등 -->
