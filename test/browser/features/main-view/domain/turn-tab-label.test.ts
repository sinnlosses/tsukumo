import { describe, expect, it } from "bun:test"

import { turnTab } from "../../../../../src/browser/features/main-view/domain/turn-tab-label.ts"
import { type MainViewStep, type MainViewTurn } from "../../../../../src/shared/main-view.ts"

// フィクスチャはすべて手で書いた架空の依頼とレポート（実物の会話は使わない）。

function reportStep(id: number, firstLine: string): MainViewStep {
  return {
    id,
    body: { kind: "text", report: firstLine, firstLine },
    interim: false,
    superseded: false,
    final: false,
    actions: [],
  }
}

function turn(overrides: Partial<MainViewTurn>): MainViewTurn {
  return {
    id: 3,
    request: { text: "架空の依頼", images: [] },
    steps: [],
    hasInterimReport: false,
    droppedCount: 0,
    ...overrides,
  }
}

describe("turnTab（タブの名前）", () => {
  it("依頼の1行目を名前にし、やり取りの番号をそのまま持つ", () => {
    expect(turnTab(turn({ request: { text: "架空の依頼\n2行目は出さない", images: [] } }))).toEqual(
      { id: 3, label: "架空の依頼", fullLabel: "架空の依頼" },
    )
  })

  it("レポートがまだ無い（走っている最中の）やり取りでも、依頼から名前が付く", () => {
    expect(turnTab(turn({ steps: [] })).label).toBe("架空の依頼")
  })

  it("あとからレポートが届いても、名前は依頼のまま変わらない", () => {
    const running = turnTab(turn({ steps: [] }))
    const finished = turnTab(turn({ steps: [reportStep(0, "架空のレポートの見出し")] }))

    expect(finished).toEqual(running)
  })

  it("先頭の空行と行の中の空白の並びを詰める", () => {
    expect(turnTab(turn({ request: { text: "\n\n  架空の   依頼 ", images: [] } })).label).toBe(
      "架空の 依頼",
    )
  })

  it("長い1行は切って「…」を付け、切る前の1行は fullLabel に残す", () => {
    const text = "とても長い架空の依頼の1行目で、タブには収まらない長さにしてある"
    const tab = turnTab(turn({ request: { text, images: [] } }))

    expect(tab.label.endsWith("…")).toBe(true)
    expect(Array.from(tab.label).length).toBeLessThan(Array.from(text).length)
    expect(text.startsWith(tab.label.slice(0, -1))).toBe(true)
    expect(tab.fullLabel).toBe(text)
  })

  it("切るときに絵文字（サロゲートペア）を半分に割らない", () => {
    const text = "🦊".repeat(30)
    const label = turnTab(turn({ request: { text, images: [] } })).label

    expect(label.slice(0, -1)).toBe("🦊".repeat(Array.from(label).length - 1))
  })

  it("依頼が無い・文面が空のときは、最初のレポートの先頭行へ下りる", () => {
    const steps = [reportStep(0, ""), reportStep(1, "架空のレポートの見出し")]

    expect(turnTab(turn({ request: undefined, steps })).label).toBe("架空のレポートの見出し")
    expect(
      turnTab(turn({ request: { text: "", images: ["data:image/png;base64,AA=="] }, steps })).label,
    ).toBe("架空のレポートの見出し")
  })

  it("依頼もレポートも無いときは既定の名前", () => {
    expect(turnTab(turn({ request: undefined, steps: [] })).label).toBe("（依頼なし）")
  })
})
