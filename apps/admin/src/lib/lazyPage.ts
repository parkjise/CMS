import { type ComponentType, createElement, type ReactElement, use } from 'react'

/** 미리 받을 수 있는 지연 로딩 페이지 (T-043-A) */
export interface LazyPage {
  (): ReactElement
  /** 페이지 코드를 미리 받는다 — 여러 번 불러도 한 번만 받는다 */
  preload: () => Promise<void>
}

/**
 * React.lazy 대신 쓰는 지연 로딩 페이지.
 *
 * React.lazy 는 코드를 이미 받았어도 첫 렌더에서 한 번은 멈추고(Suspense 대기 화면),
 * React 19 는 대기 화면을 보인 뒤 내용을 최대 300ms 늦게 보여 준다. 그 사이 페이지의
 * 데이터 요청도 시작되지 않는다. 로그인 확인과 동시에 `preload()` 로 받아 두면
 * 렌더 시점에 바로 그리고, 아직이면 `use()` 로 기다린다.
 */
export function lazyPage<M extends Record<string, unknown>>(
  loader: () => Promise<M>,
  exportName: keyof M & string
): LazyPage {
  let Component: ComponentType | null = null
  let pending: Promise<void> | null = null

  const preload = () => {
    pending ??= loader().then(
      (mod) => {
        Component = mod[exportName] as ComponentType
      },
      (err: unknown) => {
        pending = null // 청크 받기 실패 → 다음에 다시 시도
        throw err
      }
    )
    return pending
  }

  const Page = () => {
    if (!Component) use(preload())
    return createElement(Component!)
  }
  Page.preload = preload
  return Page
}
