# ── 고객 홈페이지 프로덕션 이미지 (T-081) ──────────────────────────────────
# Next.js standalone 빌드 → 최소 node 런타임. build context: 저장소 루트(.)
#   docker build -f apps/client/Dockerfile .
# next.config: output: 'standalone' + outputFileTracingRoot(모노레포 루트) 필요.
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
COPY apps/client/ apps/client/
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @cms/client build

# ── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# standalone 출력(server.js + 최소 node_modules)은 모노레포 구조를 보존한다.
COPY --from=builder /repo/apps/client/.next/standalone ./
COPY --from=builder /repo/apps/client/.next/static ./apps/client/.next/static
COPY --from=builder /repo/apps/client/public ./apps/client/public

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1

# 모노레포 standalone: server.js는 apps/client/ 하위에 위치
CMD ["node", "apps/client/server.js"]
