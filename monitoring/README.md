# 모니터링 스택 (T-083)

Prometheus + Alertmanager + Grafana + exporters. 백엔드는 `/metrics`로
Prometheus 지표를, 애플리케이션 에러는 Sentry로 추적한다.

## 기동
```bash
# 프로덕션 스택과 함께 실행 (네트워크/서비스명 공유)
docker compose -f docker-compose.prod.yml -f docker-compose.monitoring.yml up -d
```
- Grafana: http://<host>:3003 (admin / `GRAFANA_ADMIN_PASSWORD`)
- 대시보드 **CMS Overview** 자동 프로비저닝 (P95 지연·요청율·5xx 에러율·DB 연결·Celery 큐)

## 구성 파일
| 파일 | 역할 |
|---|---|
| `prometheus.yml` | 스크레이프 대상(backend, postgres/redis exporter) |
| `alert_rules.yml` | 알림 규칙(에러율>5%, P95>1s, 큐 적체, DB 포화, 다운) |
| `alertmanager.yml` | Slack 라우팅(critical 분리) |
| `grafana/provisioning/*` | 데이터소스 + 대시보드 프로비저닝 |
| `grafana/dashboards/cms-overview.json` | 대시보드 정의 |

## 백엔드 지표 (app.core.observability)
- `http_request_duration_seconds`(히스토그램) → P95 `histogram_quantile(0.95, ...)`
- `http_requests_total`(카운터, status 라벨) → 에러율 `status=~"5.."` 비율
- `SENTRY_DSN` 설정 시 백엔드 에러가 Sentry로 전송(미설정 시 no-op).

## 프론트엔드 에러 추적 (Sentry)
- 관리자/슈퍼어드민(Vite): `VITE_SENTRY_DSN` 설정 시 `@sentry/react` 활성.
- 고객 홈페이지(Next.js): `NEXT_PUBLIC_SENTRY_DSN`(+서버 `SENTRY_DSN`) 설정 시
  `@sentry/nextjs` (instrumentation) 활성.

## Slack 웹훅 시크릿
Alertmanager는 env 치환을 지원하지 않으므로 파일로 주입한다:
```bash
mkdir -p monitoring/secrets
echo 'https://hooks.slack.com/services/XXX/YYY/ZZZ' > monitoring/secrets/slack_url
```
`monitoring/secrets/`는 git에서 제외된다.

## 검증
```bash
# Prometheus 설정·규칙
docker run --rm -v "$PWD/monitoring":/etc/prometheus --entrypoint promtool \
  prom/prometheus:latest check config /etc/prometheus/prometheus.yml
# Alertmanager 설정
docker run --rm -v "$PWD/monitoring/alertmanager.yml":/c.yml \
  --entrypoint amtool prom/alertmanager:latest check-config /c.yml
```
