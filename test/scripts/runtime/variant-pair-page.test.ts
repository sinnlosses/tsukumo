import { describe, expect, it } from "vitest"

import {
  choiceTemplate,
  pairPage,
  pairScene,
  sideOf,
} from "../../../scripts/runtime/variant-pair-page.ts"
import { REPORT_SCHEMA_VARIANTS } from "../../../src/server/core/schema-variant.ts"
import { reportEvent } from "../../fixture/report-event.ts"

const PAIRS = [
  { pairId: "r01", requestText: "架空の家計簿アプリの丸めを直した体で報告して" },
  { pairId: "r02", requestText: "架空の貸出アプリに通知を足した体で報告して" },
  { pairId: "r03", requestText: "架空の天気ウィジェットの起動を速めた体で報告して" },
] as const

describe("pairPage", () => {
  it("対ごとに左右2枚の画を指し、依頼文を載せる", () => {
    const html = pairPage(PAIRS)

    for (const pair of PAIRS) {
      expect(html).toContain(`src="shots/${pair.pairId}-left.png"`)
      expect(html).toContain(`src="shots/${pair.pairId}-right.png"`)
      expect(html).toContain(pair.requestText)
    }
    expect(html.match(/<img /g)).toHaveLength(PAIRS.length * 2)
  })

  it("版の名前を含まない", () => {
    const html = pairPage(PAIRS)

    for (const variant of REPORT_SCHEMA_VARIANTS) {
      expect(html).not.toContain(variant)
    }
  })

  it("依頼文の HTML の記号を逃がす", () => {
    const html = pairPage([{ pairId: "r01", requestText: '<b>"架空"</b> & 依頼' }])

    expect(html).toContain("&lt;b&gt;&quot;架空&quot;&lt;/b&gt; &amp; 依頼")
  })
})

describe("choiceTemplate", () => {
  it("全部の対の ID を undecided で持つ", () => {
    expect(choiceTemplate(PAIRS.map((pair) => pair.pairId))).toEqual({
      choices: { r01: "undecided", r02: "undecided", r03: "undecided" },
    })
  })
})

describe("sideOf", () => {
  it("同じ ID には同じ側を返す", () => {
    expect(sideOf("r07")).toBe(sideOf("r07"))
  })

  it("r01〜r24 で左右の両方が出る", () => {
    const sides = new Set(
      Array.from({ length: 24 }, (_, index) => sideOf(`r${String(index + 1).padStart(2, "0")}`)),
    )

    expect(sides).toEqual(new Set(["first", "second"]))
  })
})

describe("pairScene", () => {
  it("依頼 → report → 結果 → ターンの終わりの4手で、結果は report と同じ呼び出しを指す", () => {
    const report = reportEvent({ toolUseId: "fictional-call" })

    const scene = pairScene("r01", "left", report)

    expect(scene.name).toBe("r01-left")
    expect(scene.steps.map((step) => step.event.kind)).toEqual([
      "request",
      "report",
      "tool-finished",
      "turn-finished",
    ])
    expect(scene.steps[2]?.event).toMatchObject({ toolUseId: "fictional-call", isError: false })
  })
})
