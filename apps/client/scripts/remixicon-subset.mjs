/**
 * Remix Icon CSS 축소본 생성 (T-125 모바일 성능).
 *
 * remixicon.css 는 아이콘 3천여 개 규칙(약 140KB)이라 첫 화면을 막는 CSS 가 커진다.
 * 소스에서 실제로 쓰는 `ri-*` 클래스만 골라 templates/hospital-a/styles/ 에
 * remixicon-subset.css 와 그 아이콘 글리프만 담은 remixicon-subset.woff2 (원본 약 190KB) 를 만든다.
 *
 *   pnpm icons:subset        # 아이콘을 새로 쓰면 다시 실행 (테스트가 누락을 잡는다)
 *
 * 글꼴 축소에 fonttools 가 필요하다: pip install fonttools brotli (PYFTSUBSET 로 경로 지정 가능)
 */
/* global process, console -- Node 빌드 스크립트 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const SCAN_DIRS = ['templates', 'components', 'app', 'lib']
const EXTENSIONS = /\.(tsx?|json|scss)$/
const SOURCE_DIR = join(ROOT, 'node_modules/remixicon/fonts')
export const OUTPUT = join(ROOT, 'templates/hospital-a/styles/remixicon-subset.css')
const FONT_OUTPUT = OUTPUT.replace(/\.css$/, '.woff2')
const FONT_URL = `./${relative(dirname(OUTPUT), FONT_OUTPUT)}`

const ICON_PATTERN = /\bri-[a-z0-9]+(?:-[a-z0-9]+)*/g
const SKIP = new Set(['node_modules', '.next', '__tests__'])

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return []
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return walk(path)
    return EXTENSIONS.test(name) && path !== OUTPUT ? [path] : []
  })

/** 소스에서 쓰는 아이콘 클래스 (정렬) */
export const usedIcons = () => {
  const names = new Set()
  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      for (const m of readFileSync(file, 'utf8').matchAll(ICON_PATTERN)) names.add(m[0])
    }
  }
  return [...names].sort()
}

/** 쓰는 글리프만 남긴 woff2 — fonttools(pyftsubset) */
const subsetFont = (codepoints) => {
  execFileSync(
    process.env.PYFTSUBSET ?? 'pyftsubset',
    [
      join(SOURCE_DIR, 'remixicon.ttf'),
      `--unicodes=${codepoints.map((c) => `U+${c}`).join(',')}`,
      '--flavor=woff2',
      '--no-hinting',
      '--layout-features=',
      `--output-file=${FONT_OUTPUT}`,
    ],
    { stdio: 'inherit' },
  )
}

const build = () => {
  const source = readFileSync(join(SOURCE_DIR, 'remixicon.css'), 'utf8')
  const rules = new Map(
    [...source.matchAll(/\.(ri-[a-z0-9-]+):before\s*\{\s*content:\s*("[^"]+")/g)].map((m) => [m[1], m[2]]),
  )
  const icons = usedIcons().filter((name) => rules.has(name))
  const codepoints = [...new Set(icons.map((name) => rules.get(name).slice(2, -1)))].sort()
  subsetFont(codepoints)
  const version = source.match(/Remix Icon v([\d.]+)/)?.[1] ?? '?'
  const css = [
    `/* Remix Icon v${version} 축소본 — scripts/remixicon-subset.mjs 가 생성 (직접 수정 금지, T-125)`,
    ` * Released under the Remix Icon License 1.0 — https://remixicon.com`,
    ` * glyphs: ${codepoints.join(',')} */`,
    `@font-face {`,
    `  font-family: "remixicon";`,
    `  src: url("${FONT_URL}") format("woff2");`,
    `  font-display: swap;`,
    `}`,
    ``,
    `[class^="ri-"], [class*=" ri-"] {`,
    `  font-family: "remixicon" !important;`,
    `  font-style: normal;`,
    `  -webkit-font-smoothing: antialiased;`,
    `  -moz-osx-font-smoothing: grayscale;`,
    `}`,
    ``,
    ...icons.map((name) => `.${name}:before { content: ${rules.get(name)}; }`),
    ``,
  ].join('\n')
  writeFileSync(OUTPUT, css)
  return icons
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const icons = build()
  console.log(`remixicon-subset.css: 아이콘 ${icons.length}개`)
}
