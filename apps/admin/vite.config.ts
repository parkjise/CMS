import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
          if (id.includes('/recharts/') || id.includes('/d3-'))
            return 'vendor-charts'
          if (id.includes('/@dnd-kit/')) return 'vendor-dnd'
          if (
            id.includes('/react-hook-form/') ||
            id.includes('/@hookform/') ||
            id.includes('/zod/')
          )
            return 'vendor-forms'
          if (id.includes('/@tanstack/')) return 'vendor-query'
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/react-router/') ||
            id.includes('/scheduler/')
          )
            return 'vendor-react'
          return 'vendor'
        },
      },
    },
  },
})
