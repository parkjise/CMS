# ── 슈퍼 어드민 프로덕션 이미지 (T-081) ────────────────────────────────────
# Vite 빌드(node) → Nginx 정적 서빙. build context: 저장소 루트(.)
#   docker build -f apps/superadmin/Dockerfile .
# ---------------------------------------------------------------------------

# ── Stage 1: builder ────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/ui/package.json packages/ui/
COPY packages/types/package.json packages/types/
COPY apps/admin/package.json apps/admin/
COPY apps/client/package.json apps/client/
COPY apps/superadmin/package.json apps/superadmin/
RUN pnpm install --frozen-lockfile

COPY packages/ packages/
COPY apps/superadmin/ apps/superadmin/
RUN pnpm --filter @cms/superadmin build

# ── Stage 2: runtime (Nginx 정적 서빙) ──────────────────────────────────────
FROM nginx:1.28-alpine AS runtime
COPY apps/superadmin/nginx.spa.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/apps/superadmin/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
CMD ["nginx", "-g", "daemon off;"]
