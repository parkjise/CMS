/** 첨부 파일 크기 표시 (T-194) — 1024 단위, 340KB · 2.4MB */
export const fileSize = (bytes: number): string =>
  bytes >= 1024 ** 2
    ? `${(bytes / 1024 ** 2).toFixed(1)}MB`
    : `${Math.max(1, Math.round(bytes / 1024))}KB`
