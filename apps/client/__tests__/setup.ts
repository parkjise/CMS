import { vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

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

// next/font 는 빌드 시 처리되므로 테스트에서는 클래스 이름만 흉내 낸다 (코드형 템플릿 웹폰트)
vi.mock('next/font/google', () => {
  const font = () => ({ className: 'font-mock', variable: 'font-variable-mock', style: { fontFamily: 'mock' } })
  return { Noto_Serif_KR: font, Noto_Sans_KR: font }
})
