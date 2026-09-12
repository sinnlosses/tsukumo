import { describe, expect, it } from "bun:test"

import { isAllowedLinkUrl, sanitizeReportHtml } from "../../src/presentation/report-html.ts"

// レポートに書かれた HTML を通す唯一の経路なので、**通すもの**と**落とすもの**の両方を固定する。
// 落とす側が本体（このページは会話の内容を持っている。docs/coding-standards.md「会話内容の扱い」）。

describe("sanitizeReportHtml（通すもの）", () => {
  it("段組み・カードのための要素と class を通す", () => {
    const html =
      '<div class="cols"><div class="card"><h4>決めたこと</h4><p>HTML を通す</p></div></div>'

    expect(sanitizeReportHtml(html)).toBe(html)
  })

  it("表・リスト・強調・折りたたみを通す", () => {
    const html =
      "<table><thead><tr><th>項目</th></tr></thead><tbody><tr><td><strong>値</strong></td></tr></tbody></table>" +
      "<details><summary>詳しく</summary><ul><li>中身</li></ul></details>"

    expect(sanitizeReportHtml(html)).toBe(html)
  })

  it("手で組んだ SVG の図を通す（座標・パス・矢印の属性ごと）", () => {
    const html =
      '<svg viewBox="0 0 100 40" width="100" height="40">' +
      '<rect x="0" y="0" width="40" height="20" fill="#1c202a" stroke="#3a4256" />' +
      '<line x1="40" y1="10" x2="70" y2="10" stroke="#8ab4ff" marker-end="url(#arrow)" />' +
      '<text x="4" y="14" font-size="10" fill="#e6e8ee">読む</text>' +
      "</svg>"

    const sanitized = sanitizeReportHtml(html)

    expect(sanitized).toContain("<svg")
    expect(sanitized).toContain('x1="40"')
    expect(sanitized).toContain('marker-end="url(#arrow)"')
    // 外部を指す marker は落ちる（ページ内の参照だけを許す）。
    expect(sanitizeReportHtml('<line marker-end="url(http://example.com/x)" />')).not.toContain(
      "example.com",
    )
    expect(sanitized).toContain("読む")
  })

  it("安全なスキームのリンクは rel 付きで通す", () => {
    const sanitized = sanitizeReportHtml('<a href="https://example.com/a">参照</a>')

    expect(sanitized).toContain('href="https://example.com/a"')
    expect(sanitized).toContain('rel="noopener noreferrer"')
  })

  it("外部を読みに行かない style は通す（段組みや色を書けるようにするため）", () => {
    const sanitized = sanitizeReportHtml('<div style="display:flex;gap:8px">中身</div>')

    expect(sanitized).toBe('<div style="display:flex;gap:8px">中身</div>')
  })
})

describe("sanitizeReportHtml（落とすもの）", () => {
  it("script は中身ごと捨てる（地の文として画面に出さない）", () => {
    const sanitized = sanitizeReportHtml('<p>前</p><script>alert("x")</script><p>後</p>')

    expect(sanitized).toBe("<p>前</p><p>後</p>")
    expect(sanitized).not.toContain("alert")
  })

  it("style 要素・iframe も中身ごと捨てる", () => {
    const sanitized = sanitizeReportHtml(
      '<style>body{display:none}</style><iframe src="http://example.com">代替</iframe><p>残る</p>',
    )

    expect(sanitized).toBe("<p>残る</p>")
  })

  it("イベントハンドラ属性（on*）を落とす", () => {
    const sanitized = sanitizeReportHtml('<div onclick="alert(1)" class="card">押して</div>')

    expect(sanitized).toBe('<div class="card">押して</div>')
    expect(sanitized).not.toContain("onclick")
  })

  it("javascript: のリンクは、リンクにせず文字だけ残す", () => {
    const sanitized = sanitizeReportHtml('<a href="javascript:alert(1)">押して</a>')

    expect(sanitized).toBe("<a>押して</a>")
    expect(sanitized).not.toContain("javascript:")
  })

  it("外部を読みに行く style は落とす", () => {
    const sanitized = sanitizeReportHtml(
      '<div style="background:url(http://example.com/x.png)">中身</div>',
    )

    expect(sanitized).toBe("<div>中身</div>")
  })

  it("許可していない要素はタグだけ落とし、中身のテキストは残す", () => {
    const sanitized = sanitizeReportHtml("<marquee><form>大事な内容</form></marquee>")

    expect(sanitized).toBe("大事な内容")
  })

  it("img は通さない（外部への通信を作らないため）", () => {
    const sanitized = sanitizeReportHtml(
      '<p>図: <img src="http://example.com/a.png" alt="図" /></p>',
    )

    expect(sanitized).toBe("<p>図: </p>")
  })

  it("タグの外にある地の文はエスケープする（引用した他人のテキストが解釈されない）", () => {
    const sanitized = sanitizeReportHtml("<p>利用者はこう書いた: 3 < 5 && 5 > 1</p>")

    expect(sanitized).toContain("3 &lt; 5 &amp;&amp; 5 &gt; 1")
  })

  it("属性値のエスケープを壊す入力を弾く", () => {
    const sanitized = sanitizeReportHtml('<div class="a\\" onmouseover=\\"alert(1)">中身</div>')

    expect(sanitized).not.toContain("onmouseover")
    expect(sanitized).not.toContain("alert(1)")
  })

  it("閉じられていない要素は末尾で閉じ、対応しない閉じタグは捨てる", () => {
    expect(sanitizeReportHtml("<div><p>途中で終わる")).toBe("<div><p>途中で終わる</p></div>")
    expect(sanitizeReportHtml("</div><p>本文</p>")).toBe("<p>本文</p>")
  })

  it("コメントは中身ごと捨てる", () => {
    expect(sanitizeReportHtml("<!-- <script>alert(1)</script> --><p>本文</p>")).toBe("<p>本文</p>")
  })
})

describe("isAllowedLinkUrl", () => {
  it("http / https / mailto と相対リンクを許す", () => {
    expect(isAllowedLinkUrl("https://example.com")).toBe(true)
    expect(isAllowedLinkUrl("http://example.com")).toBe(true)
    expect(isAllowedLinkUrl("mailto:a@example.com")).toBe(true)
    expect(isAllowedLinkUrl("/layout")).toBe(true)
    expect(isAllowedLinkUrl("#section")).toBe(true)
  })

  it("javascript: / data: と未知のスキームを弾く（大文字small混じりも）", () => {
    expect(isAllowedLinkUrl("javascript:alert(1)")).toBe(false)
    expect(isAllowedLinkUrl("  JavaScript:alert(1)")).toBe(false)
    expect(isAllowedLinkUrl("data:text/html,<script>")).toBe(false)
    expect(isAllowedLinkUrl("file:///etc/passwd")).toBe(false)
  })
})
