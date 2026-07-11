# ── 테넌트 관리자 프로덕션 이미지 (T-081) ──────────────────────────────────
# Vite 빌드(node) → Nginx 정적 서빙. build context: 저장소 루트(.)
#   docker build -f apps/admin/Dockerfile .
# pnpm 모노레포이므로 워크스페이스 매니페스트 전체를 먼저 복사해 설치 캐시 확보.
# ---------------------------------------------------------------------------

# ── Stage 1: builder ────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /repo

# 1) 매니페스트만 먼저 복사 → 의존성 레이어 캐시
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/ui/package.json packages/ui/
COPY packages/types/package.json packages/types/
COPY apps/admin/package.json apps/admin/
COPY apps/client/package.json apps/client/
COPY apps/superadmin/package.json apps/superadmin/
RUN pnpm install --frozen-lockfile

# 2) 소스 복사 후 빌드 (@cms/ui·types는 소스로 번들되므로 packages 전체 필요)
COPY packages/ packages/
COPY apps/admin/ apps/admin/
RUN pnpm --filter @cms/admin build

# ── Stage 2: runtime (Nginx 정적 서빙) ──────────────────────────────────────
FROM nginx:1.28-alpine AS runtime
COPY apps/admin/nginx.spa.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/apps/admin/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
CMD ["nginx", "-g", "daemon off;"]
