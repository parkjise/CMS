/** 섹션별로 겹치지 않는 제목 id (같은 블록이 한 페이지에 여러 번 나와도 aria-labelledby 가 맞도록) */
export const titleId = (block: string, sectionId: string) =>
  `${block}-title-${sectionId.replace(/[^a-zA-Z0-9-]/g, '-')}`
