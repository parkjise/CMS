// ════════════════════════════════════════════════════════════════
// BOARD LIST — 게시판 목록 검색 (components/sub/board-list.html)
// - 목업용: 현재 목록에서 제목에 검색어가 들어간 글만 남기고 총 건수를 갱신
//   (실제 이식 시에는 API 검색 + 페이지 이동으로 대체)
// - 검색어를 지우고 검색하면 전체 목록으로 돌아감
// ════════════════════════════════════════════════════════════════
document.addEventListener('includes:loaded', () => {
  const board = document.querySelector('.board-list')
  if (!board) return

  const form = board.querySelector('.board-list__search')
  const input = form.querySelector('.board-list__search-input')
  const count = board.querySelector('.board-list__count')
  const empty = board.querySelector('.board-list__empty')
  const pagination = board.querySelector('.board-list__pagination')
  const items = [...board.querySelectorAll('.board-list__item')]
  const totalText = count.textContent

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const keyword = input.value.trim().toLowerCase()
    let shown = 0
    items.forEach((item) => {
      const subject = item.querySelector('.board-list__subject').textContent.toLowerCase()
      const match = !keyword || subject.includes(keyword)
      item.hidden = !match
      if (match) shown += 1
    })
    count.textContent = keyword ? String(shown) : totalText
    empty.hidden = shown > 0
    pagination.hidden = Boolean(keyword)
  })
})
