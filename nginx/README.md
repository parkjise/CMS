# Nginx + SSL (T-080)

프로덕션 리버스 프록시 및 TLS 종단 설정.

## 파일 구성
```
nginx/
├── nginx.conf          # 메인 설정 (docker-compose.prod.yml이 마운트)
├── certs/              # Let's Encrypt 인증서 저장소 (certbot이 관리, git 제외)
│   └── live/<domain>/  # fullchain.pem, privkey.pem
├── sites-enabled/      # 커스텀 도메인(T-100) 동적 서버 블록 (git 제외)
└── README.md
```

## 도메인 라우팅
| 호스트 | 대상 |
|---|---|
| `cms.example.com`, `www.` | 고객 홈페이지 (Next.js) |
| `admin.cms.example.com` | 테넌트 관리자 (Vite SPA) |
| `system.cms.example.com` | 슈퍼 어드민 (Vite SPA) |
| `/api/**` (모든 호스트) | FastAPI 백엔드 |
| 커스텀 도메인 | `sites-enabled/*.conf` 동적 include |

> **실도메인 적용:** `nginx.conf`의 `cms.example.com`을 실제 도메인으로 일괄 치환.

## SSL 인증서 최초 발급 (Let's Encrypt / webroot)

1. DNS A 레코드가 서버 IP를 가리키는지 확인.
2. nginx를 HTTP(:80)만으로 먼저 기동 (ACME 챌린지 응답용).
3. 발급:
```bash
docker compose -f docker-compose.prod.yml run --rm certbot \
  certbot certonly --webroot -w /var/www/certbot \
  -d cms.example.com -d www.cms.example.com \
  -d admin.cms.example.com -d system.cms.example.com \
  --email ops@cms.example.com --agree-tos --no-eff-email
```
4. 인증서가 `nginx/certs/live/cms.example.com/`에 생성되면 nginx 재로드:
```bash
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

## 자동 갱신
`certbot` 서비스가 12시간마다 `certbot renew`를 실행한다. 갱신 후 nginx는
인증서 파일 변경을 다음 재로드 시 반영하므로, 주기적 `nginx -s reload`
(예: cron 또는 certbot `--deploy-hook`)를 권장한다.

## 설정 검증
```bash
# 문법 검증 (인증서 파일이 존재해야 통과)
docker run --rm \
  -v "$PWD/nginx/nginx.conf:/etc/nginx/nginx.conf:ro" \
  -v "$PWD/nginx/certs:/etc/nginx/certs:ro" \
  nginx:1.28-alpine nginx -t
```

## 보안/성능 요약
- TLS 1.2/1.3, 강한 ECDHE 사이퍼, `ssl_session_tickets off`.
- HSTS(1년, preload), `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `server_tokens off`.
- Gzip 압축, Next.js `_next/static` 장기 캐시.
- Rate limiting: IP당 100 req/min (`/api/` burst 허용), 슈퍼 어드민 더 엄격.
- SSE(`/api/v1/notifications/stream`) 버퍼링 비활성 + 장기 타임아웃.
- 업스트림 지연 해석(변수 + resolver)으로 프론트 서비스 미기동 시에도
  nginx 부팅 안전(요청 시 502).
