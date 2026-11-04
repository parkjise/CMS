import { vi } from 'vitest'
import { configure } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// findBy* · waitFor 기본 대기 1초 → 3초 — CI · 바쁜 컴퓨터에서 회원 화면 테스트가 가끔 넘기던 문제 (T-114-A)
configure({ asyncUtilTimeout: 3000 })

// jsdom 환경에서 localStorage stub (zustand persist 사용)
const createStorageMock = () => {
  let store: Record<string, string> = {}
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = String(v)
    },
    removeItem: (k: string) => {
      delete store[k]
    },
    clear: () => {
      store = {}
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length
    },
  }
}

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: createStorageMock(),
})

// jsdom 에 없는 레이아웃 API — 편집 모드 글자 끝 위치 재기 (T-125-H)
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)
Range.prototype.getBoundingClientRect = () => new DOMRect()
