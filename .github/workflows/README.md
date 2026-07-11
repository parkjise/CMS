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

## 알려진 공백
- **ESLint 미설치**: 프론트 `lint` 스크립트(`eslint`/`next lint`)가 아직
  동작하지 않아 `test.yml`에서 lint 스텝을 제외했다. ESLint 설정 완료 후
  `pnpm -r --if-present lint` 스텝을 추가할 것.
