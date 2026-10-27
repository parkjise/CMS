import { describe, expect, it } from 'vitest'
import {
  isSafeHref,
  richToPlainText,
  sanitizeRichHtml,
  serializeEditable,
  toEditableHtml,
} from '@/lib/richText'

// 서식 있는 글 — 표시 직전 재검사 · 편집 내용 직렬화 (T-065-A)

const div = (html: string) => {
  const el = document.createElement('div')
  el.innerHTML = html
  return el
}

describe('sanitizeRichHtml', () => {
  it('허용 서식은 그대로', () => {
    expect(sanitizeRichHtml('<b>굵게</b> <i>기울임</i>줄<br>바꿈')).toBe('<b>굵게</b> <i>기울임</i>줄<br>바꿈')
    expect(sanitizeRichHtml('<span class="rt-c-primary">색</span>')).toBe(
      '<span class="rt-c-primary">색</span>',
    )
  })

  it('strong · em 은 b · i 로', () => {
    expect(sanitizeRichHtml('<strong>a</strong><em>b</em>')).toBe('<b>a</b><i>b</i>')
  })

  it('링크는 새 창 + noopener', () => {
    expect(sanitizeRichHtml('<a href="https://example.com">x</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">x</a>',
    )
  })

  it.each([
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<img src="x" onerror="alert(1)">',
    '<svg onload="alert(1)"></svg>',
    '<a href="javascript:alert(1)">x</a>',
    '<a href=" javascript:alert(1)">x</a>',
    '<a href="//evil.example">x</a>',
    '<b onclick="alert(1)">x</b>',
    '<span class="rt-c-primary" style="background:url(x)">x</span>',
    '<iframe src="https://evil.example"></iframe>',
    "<b onclick='alert(1)'>x</b>",
  ])('위험한 입력 제거: %s', (payload) => {
    // 결과를 실제로 그려 보고 — 허용 태그 · 허용 속성 말고는 하나도 없어야 한다 (글자로 남는 건 무해)
    const rendered = div(sanitizeRichHtml(payload))
    rendered.querySelectorAll('*').forEach((el) => {
      expect(['B', 'I', 'BR', 'A', 'SPAN']).toContain(el.tagName)
      Array.from(el.attributes).forEach((attr) => {
        expect(['href', 'target', 'rel', 'class']).toContain(attr.name)
        if (attr.name === 'href') expect(isSafeHref(attr.value)).toBe(true)
      })
    })
  })

  it('허용 목록 밖 꺾쇠는 글자로', () => {
    expect(sanitizeRichHtml('<무료 상담> & 1 < 2')).toBe('&lt;무료 상담&gt; &amp; 1 &lt; 2')
  })

  it('저장된 이스케이프 글자는 다시 태그가 되지 않는다', () => {
    expect(sanitizeRichHtml('&lt;script&gt;alert(1)&lt;/script&gt;')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    )
  })

  it('모르는 클래스만 있는 span · 위험한 링크는 감싸기를 버리고 글자는 남긴다', () => {
    expect(sanitizeRichHtml('<span class="evil">a</span><a href="javascript:x">b</a>')).toBe('ab')
  })

  it('닫히지 않은 태그는 닫아 준다', () => {
    expect(sanitizeRichHtml('<b>열림')).toBe('<b>열림</b>')
  })
})

describe('isSafeHref', () => {
  it.each(['https://a.com', 'http://a.com', 'tel:010', 'mailto:a@b.c', '/about', '#contact'])('허용: %s', (h) =>
    expect(isSafeHref(h)).toBe(true),
  )
  it.each(['javascript:alert(1)', 'data:text/html,x', '//evil.example', 'vbscript:x'])('차단: %s', (h) =>
    expect(isSafeHref(h)).toBe(false),
  )
})

describe('richToPlainText', () => {
  it('태그를 빼고 줄바꿈 · 엔티티 복원', () => {
    expect(richToPlainText('<b>a</b><br>&lt;b&gt; &amp;')).toBe('a\n<b> &')
  })
})

describe('serializeEditable', () => {
  it('서식이 없으면 일반 글자로', () => {
    expect(serializeEditable(div('그냥 글 &lt;태그&gt;'))).toEqual({
      value: '그냥 글 <태그>',
      rich: false,
      length: 9,
    })
  })

  it('서식이 있으면 정리된 HTML', () => {
    const r = serializeEditable(div('<strong>굵게</strong> <span class="rt-c-accent extra">색</span>'))
    expect(r.rich).toBe(true)
    expect(r.value).toBe('<b>굵게</b> <span class="rt-c-accent">색</span>')
    expect(r.length).toBe(4)
  })

  it('브라우저가 만든 style 굵게도 b 로', () => {
    const r = serializeEditable(div('<span style="font-weight: bold;">a</span>'))
    expect(r.value).toBe('<b>a</b>')
  })

  it('편집 영역에 섞여 들어온 위험한 요소는 버린다', () => {
    const r = serializeEditable(div('<b>a</b><img src="x" onerror="alert(1)"><a href="javascript:x">b</a>'))
    expect(r.value).toBe('<b>a</b>b')
  })

  it('여러 줄 — div · br 은 줄바꿈', () => {
    const r = serializeEditable(div('첫 줄<div><b>둘째</b></div><div>셋째<br></div>'), { multiline: true })
    expect(r.value).toBe('첫 줄<br><b>둘째</b><br>셋째')
  })

  it('한 줄 칸은 줄바꿈을 공백으로', () => {
    const r = serializeEditable(div('a\nb'))
    expect(r.value).toBe('a b')
  })

  it('글자 수 한도는 태그를 뺀 글자로 자른다', () => {
    const r = serializeEditable(div('<b>가나다</b>라마'), { maxLength: 4 })
    expect(r.value).toBe('<b>가나다</b>라')
    expect(r.length).toBe(4)
  })
})

describe('toEditableHtml', () => {
  it('일반 글자는 글자로 (꺾쇠 이스케이프, 줄바꿈 br)', () => {
    expect(toEditableHtml('<b>\n줄', false)).toBe('&lt;b&gt;<br>줄')
  })
  it('서식 글은 정리해서', () => {
    expect(toEditableHtml('<b>a</b><script>x</script>', true)).toBe('<b>a</b>x')
  })
})
