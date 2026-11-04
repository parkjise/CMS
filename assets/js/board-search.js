// ════════════════════════════════════════════════════════════════
// BOARD SEARCH — 게시판 상단 검색 (board-list, consult-board 공용)
// - 목업용: 현재 목록에서 제목에 검색어가 들어간 글만 남기고 총 건수를 갱신
//   (실제 이식 시에는 API 검색 + 페이지 이동으로 대체)
// - 검색어를 지우고 검색하면 전체 목록으로 돌아감
// - 마크업 약속 (같은 section 안):
//   [data-board-search] 검색 form · [data-board-count] 총 건수
//   [data-board-item] 글 하나 · [data-board-subject] 글 제목
//   [data-board-empty] 결과 없음 안내 · [data-board-pagination] 페이지 이동
// ════════════════════════════════════════════════════════════════
document.addEventListener('includes:loaded', () => {
  document.querySelectorAll('[data-board-search]').forEach((form) => {
    const board = form.closest('section')
    const input = form.querySelector('input[type="search"]')
    const count = board.querySelector('[data-board-count]')
    const empty = board.querySelector('[data-board-empty]')
    const pagination = board.querySelector('[data-board-pagination]')
    const items = [...board.querySelectorAll('[data-board-item]')]
    const totalText = count.textContent

    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const keyword = input.value.trim().toLowerCase()
      let shown = 0
      items.forEach((item) => {
        const subject = item.querySelector('[data-board-subject]').textContent.toLowerCase()
        const match = !keyword || subject.includes(keyword)
        item.hidden = !match
        if (match) shown += 1
      })
      count.textContent = keyword ? String(shown) : totalText
      empty.hidden = shown > 0
      pagination.hidden = Boolean(keyword)
    })
  })
})
