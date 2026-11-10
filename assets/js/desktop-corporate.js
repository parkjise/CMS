// Desktop presentation enhancements. Original content stays available below 1024px.
export function enhanceDesktopCorporate() {
  const desktop = window.matchMedia('(min-width: 1024px)')
  const originalTitle = document.title
  const updateTitle = () => {
    document.title = desktop.matches
      ? (location.pathname.endsWith('/_template.html') ? 'DYNATECH | 초정밀 기술로 여는 미래' : originalTitle.replaceAll('BAZZAR', 'DYNATECH'))
      : originalTitle
  }
  updateTitle()
  desktop.addEventListener('change', updateTitle)

  const copy = (element, html) => {
    if (!element) return
    const mobile = document.createElement('span')
    mobile.className = 'corporate-mobile-only'
    mobile.append(...element.childNodes)
    const pc = document.createElement('span')
    pc.className = 'corporate-desktop-only'
    pc.innerHTML = html
    element.append(mobile, pc)
  }

  // Responsive sources keep the existing mobile photos unchanged.
  const photo = (img, url) => {
    if (!img) return
    const picture = document.createElement('picture')
    const source = document.createElement('source')
    source.media = '(min-width: 1024px)'
    source.srcset = url
    img.before(picture)
    picture.append(source, img)
  }
  const page = location.pathname.split('/').pop()
  if (page === 'about-history.html') {
    document.querySelectorAll('.corp-section span').forEach(el => {
      if (el.textContent.includes('PRESENT')) el.classList.add('corp-history-current-year')
    })
  }
  const hero = document.querySelector('.sub-hero__image')
  if (page === 'about.html' || page.startsWith('about-')) photo(hero, './assets/images/head_slide2.jpg')
  if (page.startsWith('portfolio-')) photo(hero, 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1920&q=80')
  if (page === 'notice.html' || page === 'notice-view.html') photo(hero, './assets/images/unsplash/about-hero.jpg')
  document.querySelectorAll('img[src*="photo-1507003211169"]').forEach(img => {
    photo(img, './assets/images/corporate/ceo-portrait.jpg')
    if (page === 'about-greeting.html') {
      const section = img.closest('.corp-section')
      section.classList.add('corp-greeting')
      const layout = section.querySelector('.corp-grid-2')
      layout.classList.add('corp-greeting__layout')
      img.parentElement.parentElement.querySelector('div')?.classList.add('corp-greeting__overlay')
      const body = layout.children[1]
      body.children[2]?.classList.add('corp-greeting__body')
      body.lastElementChild?.lastElementChild?.classList.add('corp-greeting__signature')
    }
  })

  // Preserve table semantics on mobile, present the same data as cards on desktop.
  document.querySelectorAll('.corp-table').forEach(table => {
    const cards = document.createElement('div')
    cards.className = 'corp-info-cards'
    const headings = [...table.querySelectorAll('thead th')].map(el => el.textContent.trim())
    const addField = (list, label, value) => {
      const row = document.createElement('div')
      const dt = document.createElement('dt')
      const dd = document.createElement('dd')
      dt.textContent = label
      dd.textContent = value
      row.append(dt, dd)
      list.append(row)
    }
    table.querySelectorAll('tbody tr').forEach((tr, index) => {
      const cells = [...tr.children]
      if (headings.length) {
        cards.classList.add('corp-info-cards--equipment')
        const article = document.createElement('article')
        article.className = 'corp-info-card'
        const number = document.createElement('span')
        number.className = 'corp-info-card__index'
        number.textContent = String(index + 1).padStart(2, '0')
        const title = document.createElement('h4')
        title.textContent = cells[0].textContent.trim()
        const details = document.createElement('dl')
        cells.slice(1).forEach((cell, i) => addField(details, headings[i + 1], cell.textContent.trim()))
        article.append(number, title, details)
        cards.append(article)
      } else {
        for (let i = 0; i < cells.length; i += 2) {
          const card = document.createElement('dl')
          card.className = 'corp-info-card'
          if (cells[i + 1]?.colSpan > 1) card.classList.add('corp-info-card--wide')
          addField(card, cells[i].textContent.trim(), cells[i + 1]?.textContent.trim() || '')
          cards.append(card)
        }
      }
    })
    table.closest('.corp-table-wrap').classList.add('corp-table-wrap--desktop-cards')
    table.closest('.corp-table-wrap').after(cards)
  })

  if (page === 'portfolio-partners.html') {
    document.querySelector('main').classList.add('corp-partners-page')
    const logos = ['hyundai.png', 'kia.webp', 'mobis.png', 'lg-energy.svg', 'samsung.png', 'sk-hynix.jpg', 'wonik.png', 'semes.png', 'doosan.svg', 'hanwha.svg', 'hyundai-robotics.png', 'naver-labs.svg']
    document.querySelectorAll('.corp-grid-4 .corp-card').forEach((card, index) => {
      const label = card.querySelector('span')
      if (!label || !logos[index]) return
      label.classList.add('corporate-mobile-only')
      const img = document.createElement('img')
      img.className = 'corporate-desktop-only corp-partner-logo'
      img.src = `./assets/images/corporate/partners/${logos[index]}`
      img.alt = label.textContent.trim()
      img.loading = 'lazy'
      card.append(img)
    })
  }

  if (page === '_template.html') {
    const banners = [
      ['PRECISION ENGINEERING', '미래 산업의 기준을<br />만드는 초정밀 기술', 'DYNATECH의 기술과 비전을 만나보세요.'],
      ['TECHNOLOGY & TRUST', '정밀한 측정에서<br />신뢰할 수 있는 결과까지', '연구개발과 품질 혁신의 소식을 전합니다.'],
      ['GROWING TOGETHER', '함께 설계하는 혁신,<br />함께 만드는 내일', '고객과 파트너의 가능성을 연결합니다.'],
    ]
    document.querySelectorAll('.main-popup__img a').forEach((link, i) => {
      link.querySelector('img').classList.add('corporate-mobile-only')
      const banner = document.createElement('span')
      banner.className = 'corporate-popup-banner corporate-desktop-only'
      banner.innerHTML = `<small>DYNATECH / ${banners[i][0]}</small><strong>${banners[i][1]}</strong><span>${banners[i][2]}</span><b>소식 더 알아보기 ↗</b>`
      link.append(banner)
    })
  }

  // Replace remaining visible legacy brand names on desktop only.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: node => node.textContent.includes('BAZZAR') && !node.parentElement.closest('script, style, .corporate-mobile-only, .corporate-desktop-only') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  })
  const nodes = []
  while (walker.nextNode()) nodes.push(walker.currentNode)
  nodes.forEach(node => {
    const wrapper = document.createElement('span')
    node.replaceWith(wrapper)
    wrapper.append(node)
    copy(wrapper, node.textContent.replaceAll('BAZZAR', 'DYNATECH'))
  })
}
