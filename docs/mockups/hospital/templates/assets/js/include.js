// ════════════════════════════════════════════════════════════════
// HTML partial include — <div data-include="components/header.html"></div>
// ────────────────────────────────────────────────────────────────
// - data-include 요소를 해당 파일 내용으로 통째로 교체한다 (래퍼 div 남지 않음).
// - partial 안에 data-include 가 있으면 재귀로 불러온다.
// - 값 전달: include 요소의 data-* 값이 partial 안의 {{키}} 자리에 들어간다 (camelCase).
//     <div data-include="components/sub/sub-hero.html" data-page-title="브랜드 소개"></div>
//     → sub-hero.html 의 {{pageTitle}} 이 '브랜드 소개' 로 치환 (HTML 이스케이프됨)
//   값이 없는 {{키}} 는 빈 문자열이 된다.
// - 모든 include 완료 후 document 에 'includes:loaded' 이벤트 발생.
//   → 컴포넌트 DOM 에 의존하는 스크립트는 이 이벤트 안에서 실행할 것.
// - partial 안의 상대경로(이미지 등)는 '페이지(_template.html) 기준'으로 해석된다.
// - fetch 는 file:// 에서 막히므로 Live Server 등 로컬 서버로 열어야 한다.
// ════════════════════════════════════════════════════════════════
;(() => {
  const showFileProtocolNotice = () => {
    document.body.insertAdjacentHTML(
      'afterbegin',
      `<div style="padding:16px 24px;background:#fef3c7;color:#92400e;font:14px/1.6 system-ui">
        컴포넌트를 불러오려면 로컬 서버로 열어야 합니다 (file:// 에서는 fetch 차단).<br />
        VSCode: _template.html 우클릭 → <b>Open with Live Server</b>
        &nbsp;·&nbsp; 터미널: <code>npx serve docs/mockups/hospital/templates</code>
      </div>`,
    )
  }

  const escapeHtml = (value) =>
    value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])

  // {{키}} → include 요소의 data-키 값
  const fillParams = (html, el) =>
    html.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => escapeHtml(el.dataset[key] ?? ''))

  const includeAll = async (root) => {
    const targets = [...root.querySelectorAll('[data-include]')]
    await Promise.all(
      targets.map(async (el) => {
        const src = el.getAttribute('data-include')
        try {
          const res = await fetch(src)
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
          const tpl = document.createElement('template')
          tpl.innerHTML = fillParams(await res.text(), el)
          await includeAll(tpl.content) // 중첩 include
          el.replaceWith(tpl.content)
        } catch (err) {
          el.outerHTML = `<!-- include 실패: ${src} (${err.message}) -->`
          console.error(`[include] ${src} 불러오기 실패`, err)
        }
      }),
    )
  }

  const run = async () => {
    if (location.protocol === 'file:') {
      showFileProtocolNotice()
      return
    }
    await includeAll(document)
    document.dispatchEvent(new CustomEvent('includes:loaded'))
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run)
  } else {
    run()
  }
})()
