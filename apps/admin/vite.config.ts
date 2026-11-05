import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

/**
 * 로그인 연장(/auth/refresh)을 앱 JS 를 받는 동안 미리 시작 (T-043-B).
 * 예전엔 JS → refresh → 화면 데이터 순서라, 첫 화면이 refresh 왕복만큼 늦었다.
 * 결과는 authStore.initialize 가 한 번만 받아 쓴다 (refresh 토큰은 한 번 쓰면 바뀌므로 다시 부르지 않게).
 * 관리자 화면(/admin…) 에서만 — 로그인 화면은 쿠키가 없어 보낼 필요가 없다.
 */
const refreshPrefetch = (apiBase: string): Plugin => ({
  name: 'cms-refresh-prefetch',
  transformIndexHtml: () => [
    {
      tag: 'script',
      injectTo: 'head-prepend',
      children:
        `if(location.pathname.indexOf('/admin')===0){window.__cmsRefresh=fetch(${JSON.stringify(`${apiBase}/v1/auth/refresh`)},` +
        `{method:'POST',credentials:'include'}).then(function(r){return r.json().then(function(b){return{status:r.status,body:b}})})` +
        `.catch(function(){return null})}`,
    },
  ],
})

// recharts 만 쓰는 하위 패키지 — 예전엔 공용 vendor 에 섞여 모든 화면이 첫 로딩에 받았다
// (lodash 등 약 290KB, T-043-B). 차트는 화면이 그려진 뒤 따로 받는다 (components/charts)
const CHART_ONLY_DEPS = [
  'lodash',
  'decimal.js-light',
  'react-smooth',
  'recharts-scale',
  'eventemitter3',
  'victory-vendor',
  'tiny-invariant',
  'prop-types',
  'react-transition-group',
  'dom-helpers',
]

// 글 편집기(Tiptap)와 그 하위 패키지 — 글쓰기 화면에서만 받는다 (T-143)
// fast-equals 는 차트 · 편집기가 함께 써서 어느 쪽에도 넣지 않고 공용 vendor 에 둔다
const EDITOR_ONLY_PATHS = [
  '/@tiptap/',
  '/prosemirror-',
  '/orderedmap/',
  '/rope-sequence/',
  '/w3c-keyname/',
  '/linkifyjs/',
]

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    refreshPrefetch(loadEnv(mode, __dirname).VITE_API_BASE_URL ?? 'http://localhost:8000/api'),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3001,
  },
  // 운영처럼 같은 주소에서 /api 를 쓰는 미리보기 — Lighthouse 측정용 (T-043-A)
  //   VITE_API_BASE_URL=/api pnpm build && pnpm exec vite preview
  // (운영은 admin.도메인/api 로 같은 출처라 CORS 사전 요청이 없다)
  preview: {
    port: 3001,
    proxy: { '/api': 'http://localhost:8000' },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (
            id.includes('/recharts/') ||
            id.includes('/d3-') ||
            CHART_ONLY_DEPS.some((dep) => id.includes(`/node_modules/${dep}/`))
          )
            return 'vendor-charts'
          if (id.includes('/@dnd-kit/')) return 'vendor-dnd'
          if (EDITOR_ONLY_PATHS.some((path) => id.includes(path))) return 'vendor-editor'
          if (
            id.includes('/react-hook-form/') ||
            id.includes('/@hookform/') ||
            id.includes('/zod/')
          )
            return 'vendor-forms'
          if (id.includes('/@tanstack/')) return 'vendor-query'
          // /node_modules/ 까지 본다 — '/react/' 만 보면 @tiptap/react 도 걸려
          // 묶음끼리 서로 불러오다 빌드본 관리자 화면이 통째로 멈춘다 (T-143)
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/react-router/') ||
            id.includes('/node_modules/scheduler/')
          )
            return 'vendor-react'
          return 'vendor'
        },
      },
    },
  },
}))
