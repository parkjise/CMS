export interface SubNavTab {
  key: string
  href: string
  title: string
}

/** 같은 묶음의 페이지 탭 — 목업 sub/sub-nav.html (현재 페이지 aria-current="page") */
export function SubNav({ tabs, current }: { tabs: SubNavTab[]; current: string }) {
  return (
    <nav className="sub-nav" aria-label="하위 메뉴">
      <div className="page-container">
        <ul className="sub-nav__list">
          {tabs.map((tab) => (
            <li className="sub-nav__item" key={tab.key}>
              <a
                className="sub-nav__link"
                href={tab.href}
                aria-current={tab.key === current ? 'page' : undefined}
              >
                {tab.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}
