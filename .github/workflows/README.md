# CI/CD 워크플로 (T-082)

## 워크플로
| 파일 | 트리거 | 역할 |
|---|---|---|
| `test.yml` | PR, `main`/`develop` push | 백엔드(ruff+mypy+alembic+pytest≥70%) · 프론트(lint+type-check+vitest) · **E2E**(실제 백엔드+홈페이지 Playwright, T-082-A) |
| `deploy.yml` | `Test` 성공(`workflow_run`, main) | 4개 이미지 ECR 푸시 → ECS 롤링 배포 |

## 머지 차단 설정
`test.yml`의 `backend`/`frontend`/`e2e` job을 GitHub **Branch protection rules →
Require status checks to pass**에 등록하면 테스트 실패 시 머지가 차단된다.

## 필요한 GitHub Secrets (deploy.yml)
| Secret | 설명 |
|---|---|
| `AWS_ACCESS_KEY_ID` | 배포용 IAM 액세스 키 |
| `AWS_SECRET_ACCESS_KEY` | 배포용 IAM 시크릿 |
| `AWS_REGION` | 예: `ap-northeast-2` |
| `ECR_REGISTRY` | 예: `123456789.dkr.ecr.ap-northeast-2.amazonaws.com` |
| `ECS_CLUSTER` | ECS 클러스터 이름 |

배포 서비스는 `cms-backend`, `cms-worker`, `cms-beat`, `cms-client`,
`cms-admin`, `cms-superadmin` (ECS 태스크 정의가 ECR `:latest` 참조 전제).

### 배포 활성화 (기본: 비활성)
`deploy.yml`은 repo **variable** `DEPLOY_ENABLED`로 가드된다. 미설정 시
Deploy는 **회색 skip**(빨간 X 없음). AWS 준비 완료 후 활성화:
1. 위 5개 **Secrets** 등록 (Settings → Secrets and variables → Actions → Secrets)
2. **Variable** `DEPLOY_ENABLED = true` 설정 (같은 화면 → Variables 탭)
→ 이후 Test 성공 시 자동 배포. 비활성화하려면 변수를 `false`로 두거나 삭제.

## Lint
ESLint 9 flat config(`eslint.config.mjs`)로 프론트 전체를 검사한다.
`test.yml` frontend job이 `pnpm lint`(루트 단일 `eslint .` 패스)를 실행한다.

## E2E job (T-082-A)
운영 배포와 같은 순서로 준비한 뒤 Playwright 를 돌린다 — 로그인 · 저장 · 업로드를 흉내 내지 않는다.

1. PostgreSQL · Redis (서비스 컨테이너), MinIO (`docker run` — 서비스 컨테이너는 시작 명령을 못 줌)
2. `alembic upgrade head` → `init_db_roles.py`(앱 계정, RLS) → `seed.py` → `init_minio.py`
3. 백엔드 `uvicorn` (로그는 실패 시 아티팩트), 홈페이지 `pnpm build` → `pnpm start` (`E2E_WEB_COMMAND`)
4. `editmode` · `inquiry` · `homepage` · `seo` spec — `full-journey` · `tenant-isolation` 은 프론트 3개 필요로 제외
5. 실패 시 `e2e-report` 아티팩트 (Playwright 결과 · trace · 백엔드 로그, 7일)

모든 비밀번호 · 키는 CI 전용 값이다. 로컬 재현: 같은 환경변수로 위 순서를 실행하면 된다.
