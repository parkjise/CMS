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

### 배포 활성화 (기본: 비활성)
`deploy.yml`은 repo **variable** `DEPLOY_ENABLED`로 가드된다. 미설정 시
Deploy는 **회색 skip**(빨간 X 없음). AWS 준비 완료 후 활성화:
1. 위 5개 **Secrets** 등록 (Settings → Secrets and variables → Actions → Secrets)
2. **Variable** `DEPLOY_ENABLED = true` 설정 (같은 화면 → Variables 탭)
→ 이후 Test 성공 시 자동 배포. 비활성화하려면 변수를 `false`로 두거나 삭제.

## Lint
ESLint 9 flat config(`eslint.config.mjs`)로 프론트 전체를 검사한다.
`test.yml` frontend job이 `pnpm lint`(루트 단일 `eslint .` 패스)를 실행한다.
