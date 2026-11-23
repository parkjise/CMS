/** 줄 단위 비교 (T-230) — 약관 [바뀐 곳 보기]. 라이브러리 없이 LCS 로 */
export type DiffLine = { kind: 'same' | 'added' | 'removed'; text: string }
/** 화면에 보일 줄 — 바뀐 곳에서 멀리 떨어진 같은 줄은 '같은 줄 N개'로 접는다 */
export type DiffRow = DiffLine | { kind: 'skipped'; count: number }

export function collapseSame(lines: DiffLine[], context = 2): DiffRow[] {
  const near = lines.map(() => false)
  lines.forEach((line, index) => {
    if (line.kind === 'same') return
    for (
      let k = Math.max(0, index - context);
      k <= Math.min(lines.length - 1, index + context);
      k += 1
    )
      near[k] = true
  })
  const rows: DiffRow[] = []
  lines.forEach((line, index) => {
    if (near[index]) {
      rows.push(line)
      return
    }
    const last = rows[rows.length - 1]
    if (last?.kind === 'skipped') last.count += 1
    else rows.push({ kind: 'skipped', count: 1 })
  })
  return rows
}

// 약관 본문은 최대 30,000자 — 줄이 아주 많으면 표가 커지므로 앞뒤 같은 줄은 먼저 떼어 낸다
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n')
  const b = after.split('\n')
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1
    endB -= 1
  }
  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)

  // lcs[i][j] = midA[i..] 와 midB[j..] 의 가장 긴 공통 줄 수
  const lcs = Array.from({ length: midA.length + 1 }, () =>
    new Array<number>(midB.length + 1).fill(0)
  )
  for (let i = midA.length - 1; i >= 0; i -= 1) {
    for (let j = midB.length - 1; j >= 0; j -= 1) {
      lcs[i][j] =
        midA[i] === midB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const middle: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < midA.length && j < midB.length) {
    if (midA[i] === midB[j]) {
      middle.push({ kind: 'same', text: midA[i] })
      i += 1
      j += 1
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      middle.push({ kind: 'removed', text: midA[i] })
      i += 1
    } else {
      middle.push({ kind: 'added', text: midB[j] })
      j += 1
    }
  }
  for (; i < midA.length; i += 1) middle.push({ kind: 'removed', text: midA[i] })
  for (; j < midB.length; j += 1) middle.push({ kind: 'added', text: midB[j] })

  return [
    ...a.slice(0, start).map((text): DiffLine => ({ kind: 'same', text })),
    ...middle,
    ...a.slice(endA).map((text): DiffLine => ({ kind: 'same', text })),
  ]
}
