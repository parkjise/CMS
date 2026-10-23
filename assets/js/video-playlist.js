// ════════════════════════════════════════════════════════════════
// VIDEO PLAYLIST — 유튜브 대표 영상 재생 + 목록 클릭 시 교체
// ────────────────────────────────────────────────────────────────
// - data-video-id 가 실제 유튜브 ID 면 썸네일을 i.ytimg.com 에서 자동으로 불러온다.
//   (샘플 ID 'VIDEO_ID_*' 는 로컬 이미지 유지)
// - 대표 영상 재생 버튼 → youtube-nocookie iframe 으로 교체 (클릭 전엔 iframe 로드 안 함)
// - 목록 링크 클릭 → 대표 영상 자리로 교체 + aria-current 갱신
// ════════════════════════════════════════════════════════════════
document.addEventListener('includes:loaded', () => {
  const section = document.querySelector('.video-playlist')
  if (!section) return

  const player = section.querySelector('.video-playlist__player')
  const featuredTitle = section.querySelector('.video-playlist__featured-title')
  const links = [...section.querySelectorAll('.video-playlist__link')]

  const isSample = (id) => !id || id.startsWith('VIDEO_ID_')
  const thumbUrl = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`

  // 실제 ID 가 들어간 항목은 유튜브 썸네일로 교체
  links.forEach((link) => {
    const { videoId } = link.dataset
    if (!isSample(videoId)) link.querySelector('img').src = thumbUrl(videoId)
  })

  // 대표 영상 영역을 '썸네일 + 재생 버튼' 상태로 렌더링
  const renderPoster = ({ id, title, thumb }) => {
    player.dataset.videoId = id
    player.innerHTML = `
      <button class="video-playlist__play" type="button">
        <img class="video-playlist__player-image" src="${thumb}" alt="" />
        <span class="video-playlist__play-icon" aria-hidden="true"><i class="ri-play-fill"></i></span>
        <span class="sr-only">영상 재생:</span>
        <span class="sr-only video-playlist__play-label">${title}</span>
      </button>`
    featuredTitle.textContent = title
  }

  // 재생: iframe 삽입
  const play = () => {
    const id = player.dataset.videoId
    const title = featuredTitle.textContent
    const iframe = document.createElement('iframe')
    iframe.className = 'video-playlist__iframe'
    iframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`
    iframe.title = title // 스크린리더용 iframe 이름 (필수)
    iframe.allow =
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
    iframe.allowFullscreen = true
    player.replaceChildren(iframe)
    iframe.focus()
  }

  player.addEventListener('click', (event) => {
    if (event.target.closest('.video-playlist__play')) play()
  })

  // 첫 대표 영상도 실제 ID 면 유튜브 썸네일 사용
  const firstId = player.dataset.videoId
  if (!isSample(firstId)) player.querySelector('img').src = thumbUrl(firstId)

  // 목록 클릭 → 대표 영상 교체
  links.forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault()
      links.forEach((l) => l.removeAttribute('aria-current'))
      link.setAttribute('aria-current', 'true')

      renderPoster({
        id: link.dataset.videoId,
        title: link.querySelector('.video-playlist__title').textContent.trim(),
        thumb: link.querySelector('img').src,
      })
      // 키보드 사용자를 위해 새 재생 버튼으로 포커스 이동
      player.querySelector('.video-playlist__play').focus()
    })
  })
})
