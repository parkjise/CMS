# CI/CD 워크플로 (T-082)

## 워크플로
| 파일 | 트리거 | 역할 |
|---|---|---|
| `test.yml` | PR, `main`/`develop` push | 백엔드(ruff+alembic+pytest≥70%) · 프론트(type-check+vitest) |
| `deploy.yml` | `Test` 성공(`workflow_run`, main) | 4개 이미지 ECR 푸시 → ECS 롤링 배포 |

## 머지 차단 설정
`test.yml`의 `backend`/`frontend` job을 GitHub **Branch protection rules →
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

## Lint
ESLint 9 flat config(`eslint.config.mjs`)로 프론트 전체를 검사한다.
`test.yml` frontend job이 `pnpm lint`(루트 단일 `eslint .` 패스)를 실행한다.
