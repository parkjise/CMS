/**
 * 키보드 사용자/스크린리더가 사이드바/탭바를 건너뛰고 본문으로 바로 이동할 수 있게 한다.
 * 평소엔 보이지 않다가 Tab 포커스 시 좌상단에 노출된다.
 */
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only fixed left-2 top-2 z-50 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow focus:not-sr-only focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
    >
      본문으로 건너뛰기
    </a>
  )
}
