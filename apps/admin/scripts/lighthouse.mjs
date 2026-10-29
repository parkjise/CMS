#!/usr/bin/env node
/* global process, fetch, console */
// 관리자 화면 Lighthouse 측정 (T-043-A) — 로그인한 상태로 주요 화면을 모바일 기준 N회 측정해 중앙값 출력.
// 전제: 백엔드(8000) + 운영처럼 같은 출처로 빌드한 미리보기 (vite.config preview.proxy)
//   VITE_API_BASE_URL=/api pnpm build && pnpm exec vite preview
//   LH_EMAIL=admin@test-tenant.com LH_PASSWORD=password123 LH_SLUG=test-tenant node scripts/lighthouse.mjs [runs] [page...]
// 결과 JSON 은 LH_OUT(기본 ./lighthouse-results, git 제외)에 남는다.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ADMIN = process.env.LH_ADMIN_URL ?? 'http://localhost:3001'
const API = process.env.LH_API_URL ?? `${ADMIN}/api`
const OUT = process.env.LH_OUT ?? 'lighthouse-results'
const [runsArg, ...pageArgs] = process.argv.slice(2)
const runs = Number(runsArg ?? 3)
const pages = pageArgs.length
  ? pageArgs
  : [
      'login',
      'dashboard',
      'content',
      'inquiries',
      'seo',
      'analytics',
      'templates',
      'billing',
      'reports',
      'sns',
    ]

const login = async () => {
  const res = await fetch(`${API}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.LH_EMAIL ?? 'admin@test-tenant.com',
      password: process.env.LH_PASSWORD ?? 'password123',
      tenant_slug: process.env.LH_SLUG ?? 'test-tenant',
    }),
  })
  if (!res.ok) throw new Error(`로그인 실패 ${res.status}`)
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith('refresh_token='))
  if (!cookie) throw new Error('refresh_token 쿠키 없음')
  return cookie.split(';')[0]
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

mkdirSync(OUT, { recursive: true })
const cookie = await login()
console.log(`page        perf  a11y  CLS     LCP(s)  (median of ${runs})`)
for (const page of pages) {
  const url = page === 'login' ? `${ADMIN}/login` : `${ADMIN}/admin/${page}`
  const perf = []
  const a11y = []
  const cls = []
  const lcp = []
  for (let i = 0; i < runs; i += 1) {
    const file = join(OUT, `${page.replaceAll('/', '_')}-${i}.json`)
    const args = [
      '-y',
      'lighthouse@12',
      url,
      '--quiet',
      '--chrome-flags=--headless=new',
      '--output=json',
      `--output-path=${file}`,
      '--only-categories=performance,accessibility',
    ]
    if (page !== 'login') args.push(`--extra-headers=${JSON.stringify({ Cookie: cookie })}`)
    execFileSync('npx', args, { stdio: 'ignore' })
    const r = JSON.parse(readFileSync(file, 'utf8'))
    perf.push(Math.round(r.categories.performance.score * 100))
    a11y.push(Math.round(r.categories.accessibility.score * 100))
    cls.push(r.audits['cumulative-layout-shift'].numericValue)
    lcp.push(r.audits['largest-contentful-paint'].numericValue / 1000)
  }
  console.log(
    `${page.padEnd(11)} ${String(median(perf)).padStart(4)}  ${String(median(a11y)).padStart(4)}  ${median(cls).toFixed(3).padStart(6)}  ${median(lcp).toFixed(1).padStart(6)}`
  )
}
