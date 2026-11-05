import { describe, expect, it } from "vitest"

import {
  isShortReport,
  popBlocksOf,
  SHORT_REPORT_WEIGHT,
} from "../../../../src/browser/domain/reveal/plan.ts"

/** 節の欄の入れ物（`Report` が作る形）。 */
function section(id: number, html: string): string {
  return `<div data-report-region="section" data-report-section="${String(id)}">${html}</div>`
}

/** 節でない欄の入れ物（`Report` が作る形）。 */
function region(kind: "head" | "retrospective" | "favor" | "markdown", html: string): string {
  return `<div data-report-region="${kind}">${html}</div>`
}

function rootWith(html: string): HTMLElement {
  const root = document.createElement("div")
  root.innerHTML = html
  return root
}

/** 塊ごとの、中の要素の文字。 */
function textsOf(root: HTMLElement): readonly (readonly string[])[] {
  return popBlocksOf(root).map((block) => block.map((element) => element.textContent ?? ""))
}

describe("popBlocksOf（ポンで出す塊へのまとめ方）", () => {
  it("塊が1つも無ければ何も返さない", () => {
    expect(popBlocksOf(rootWith(""))).toEqual([])
  })

  it("節の欄1つを1つの塊にし、文書の順に並べる", () => {
    const root = rootWith(
      section(0, "<h4>はじめ</h4><p>あ</p>") + section(1, "<h4>つぎ</h4><p>い</p>"),
    )

    expect(textsOf(root)).toEqual([["はじめあ"], ["つぎい"]])
  })

  it("頭の欄は塊に入れず、節の後ろの欄は直前の節と同じ塊にする", () => {
    const root = rootWith(
      region("head", "<p>結論</p>") +
        section(0, "<p>節</p>") +
        region("retrospective", "<p>振り返り</p>") +
        region("favor", "<p>お願い</p>"),
    )

    expect(textsOf(root)).toEqual([["節", "振り返り", "お願い"]])
  })

  it("欄の入れ物が無い本文は、全体を1つの塊にする", () => {
    expect(textsOf(rootWith("<p>前置き</p><p>続き</p>"))).toEqual([["前置き", "続き"]])
  })
})

describe("isShortReport（短いレポートは演出しない）", () => {
  it("出す対象の文字数が線に満たなければ短い", () => {
    expect(isShortReport(rootWith(`<p>${"あ".repeat(SHORT_REPORT_WEIGHT - 1)}</p>`))).toBe(true)
    expect(isShortReport(rootWith(`<p>${"あ".repeat(SHORT_REPORT_WEIGHT)}</p>`))).toBe(false)
  })

  it("結論は数えない", () => {
    const root = rootWith(
      region("head", `<p>${"あ".repeat(SHORT_REPORT_WEIGHT)}</p>`) + section(0, "<p>短い</p>"),
    )

    expect(isShortReport(root)).toBe(true)
  })

  it("図は1つにつき100字ぶんで数える", () => {
    expect(isShortReport(rootWith(section(0, '<div class="mermaid"></div>')))).toBe(true)
    expect(
      isShortReport(rootWith(section(0, '<div class="mermaid"></div><div class="mermaid"></div>'))),
    ).toBe(false)
  })
})
