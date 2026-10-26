import { describe, expect, it } from "vitest"

import { hasLongFirstSentence } from "../../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/report/domain/long-first-sentence.ts"

describe("hasLongFirstSentence", () => {
  it("1文目が全角50字ちょうどなら長くない", () => {
    expect(hasLongFirstSentence(`${"あ".repeat(50)}。`)).toBe(false)
  })

  it("1文目が51字なら長い", () => {
    expect(hasLongFirstSentence(`${"あ".repeat(51)}。`)).toBe(true)
  })

  it("2文目が長くても1文目だけを見る", () => {
    expect(hasLongFirstSentence(`短い。${"あ".repeat(80)}。`)).toBe(false)
  })

  it("結論の包み（div のタグ）は字数に数えない", () => {
    const wrap = (sentence: string) => `<div class="conclusion">\n\n${sentence}。\n\n</div>`

    expect(hasLongFirstSentence(wrap("短い結論"))).toBe(false)
    expect(hasLongFirstSentence(wrap("あ".repeat(50)))).toBe(false)
    expect(hasLongFirstSentence(wrap("あ".repeat(51)))).toBe(true)
  })

  it("1文目が「！」「？」で終わるときは、そこまでを1文目として数える", () => {
    expect(hasLongFirstSentence(`短い！${"あ".repeat(80)}。`)).toBe(false)
    expect(hasLongFirstSentence(`${"あ".repeat(51)}？続き。`)).toBe(true)
  })

  it("句点が無い結論は、包みの閉じタグを数えずに文字だけを数える", () => {
    const wrap = (sentence: string) => `<div class="conclusion">\n\n${sentence}\n\n</div>`

    expect(hasLongFirstSentence(wrap("あ".repeat(50)))).toBe(false)
    expect(hasLongFirstSentence(wrap("あ".repeat(51)))).toBe(true)
  })

  it("句点が無い塊は全体を1文目として数える", () => {
    expect(hasLongFirstSentence("あ".repeat(60))).toBe(true)
  })
})
