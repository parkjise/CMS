import { expect, test } from '@playwright/test'
import {
  ADMIN_URL,
  BACKEND_URL,
  CLIENT_URL,
  FULL_STACK,
  TEST_TENANT_ADMIN,
  apiLogin,
  authHeader,
} from './helpers'

// ─────────────────────────────────────────────────────────────────────────
// T-143 글 본문 편집기 — 빌드본에서 편집기 묶음이 실제로 불러와지는지 확인한다.
// 단위 테스트 · 개발 서버로는 묶음 나누기 문제를 볼 수 없다 (T-143 에서 빌드본만 멈춘 적 있음).
// 전제: 시드, 백엔드, 홈 · 관리자
// ─────────────────────────────────────────────────────────────────────────

const { email, password, slug } = TEST_TENANT_ADMIN

test.describe('T-143 글 본문 편집기', () => {
  test.skip(!FULL_STACK, '전체 스택 기동 후 활성화')

  test('글을 서식과 함께 쓰고 공개하면 홈페이지에 같은 서식으로 나온다', async ({
    page,
    request,
  }) => {
    const { accessToken } = await apiLogin(request, email, password, slug)
    const headers = authHeader(accessToken)
    const boardSlug = `e2e-editor-${Date.now()}`
    const created = await request.post(`${BACKEND_URL}/api/v1/boards`, {
      headers,
      data: { name: '편집기 시험', slug: boardSlug },
    })
    expect(created.ok()).toBeTruthy()
    const boardId = (await created.json()).data.id as string

    try {
      await page.goto(`${ADMIN_URL}/login`)
      await page.getByLabel('이메일').fill(email)
      await page.getByLabel('비밀번호').fill(password)
      await page.getByLabel('사이트 슬러그').fill(slug)
      await page.getByRole('button', { name: '로그인' }).click()
      await expect(page).toHaveURL(/\/admin\/dashboard/)

      await page.goto(`${ADMIN_URL}/admin/boards/${boardId}/posts/new`)
      await page.getByRole('textbox', { name: /^제목/ }).fill('편집기 시험 글')
      await page.getByRole('textbox', { name: '내용' }).click()
      await page.keyboard.type('보통 글자 ')
      await page.getByRole('button', { name: '굵게' }).click()
      await page.keyboard.type('굵은 글자')
      await page.getByRole('button', { name: '공개하기' }).click()
      await expect(page).toHaveURL(new RegExp(`/admin/boards/${boardId}/posts$`))

      const posts = await request.get(`${BACKEND_URL}/api/v1/boards/${boardId}/posts`, { headers })
      expect(posts.ok()).toBeTruthy()
      const postId = (await posts.json()).data.items[0].id as string

      await page.goto(`${CLIENT_URL}/${slug}/b/${boardSlug}/${postId}`)
      await expect(page.locator('.rich-body strong')).toHaveText('굵은 글자')
    } finally {
      await request.delete(`${BACKEND_URL}/api/v1/boards/${boardId}`, { headers })
    }
  })
})
