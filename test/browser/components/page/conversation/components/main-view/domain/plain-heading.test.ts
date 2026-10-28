import { describe, expect, it } from "vitest"

import { isPlainHeadingText } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/plain-heading.ts"

describe("isPlainHeadingText", () => {
  it.each(["架空の見出し", "第2章 架空の話（補足）", "Plan B の検討", "どうする？"])(
    "素の字だけの見出し %s は素の字で出してよい",
    (text) => {
      expect(isPlainHeadingText(text)).toBe(true)
    },
  )

  it.each([
    ["行内の印（差分）", "所要 {{12 → 8}}"],
    ["行内の印（折れ線）", "{{spark: 3 5 4}}"],
    ["行内の印（比率）", "{{3 / 5}}"],
    ["自動リンク（URL）", "https://example.com の話"],
    ["自動リンク（www）", "www.example.com"],
    ["自動リンク（メール）", "a@example.com"],
    ["閉じの # として消える末尾", "架空の見出し #"],
    ["強調", "**架空**の見出し"],
    ["下線の強調", "_架空_の見出し"],
    ["コード", "`code` の見出し"],
    ["取り消し線", "~~架空~~"],
    ["リンク", "[架空](x)"],
    ["HTML", "<b>架空</b>"],
    ["実体参照", "A &amp; B"],
    ["改行", "架空\nの見出し"],
    ["バックスラッシュ", "架空\\の見出し"],
  ])("%s を含む見出しは Markdown の描画に任せる", (_name, text) => {
    expect(isPlainHeadingText(text)).toBe(false)
  })
})
