const e=n=>n?.length?` 이 게시판을 보여 주는 섹션 ${n.length}개(${[...new Set(n.map(t=>t.page_title))].join(", ")})도 홈페이지에서 보이지 않게 됩니다.`:"";export{e as u};
