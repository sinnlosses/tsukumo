import { describe, expect, it } from "bun:test"

import {
  requestLinesAfterTitle,
  turnTitle,
} from "../../../../../src/browser/features/main-view/domain/turn-title.ts"
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
    failure: { kind: "none" },
    ...overrides,
  }
}

describe("turnTitle（札の頭のタイトル）", () => {
  it("依頼の1行目をタイトルにする", () => {
    expect(turnTitle(turn({ request: { text: "架空の依頼\n2行目は出さない", images: [] } }))).toBe(
      "架空の依頼",
    )
  })

  it("レポートがまだ無い（走っている最中の）ターンでも、依頼からタイトルが付く", () => {
    expect(turnTitle(turn({ steps: [] }))).toBe("架空の依頼")
  })

  it("あとからレポートが届いても、タイトルは依頼のまま変わらない", () => {
    const running = turnTitle(turn({ steps: [] }))
    const finished = turnTitle(turn({ steps: [reportStep(0, "架空のレポートの見出し")] }))

    expect(finished).toBe(running)
  })

  it("先頭の空行と行の中の空白の並びを詰める", () => {
    expect(turnTitle(turn({ request: { text: "\n\n  架空の   依頼 ", images: [] } }))).toBe(
      "架空の 依頼",
    )
  })

  it("長い1行も字数で切らない（収まらないぶんは CSS が省略する）", () => {
    const text = "とても長い架空の依頼の1行目で、札の頭の1行には収まらない長さにしてある🦊"

    expect(turnTitle(turn({ request: { text, images: [] } }))).toBe(text)
  })

  it("依頼が無い・文面が空のときは、最初のレポートの先頭行へ下りる", () => {
    const steps = [reportStep(0, ""), reportStep(1, "架空のレポートの見出し")]

    expect(turnTitle(turn({ request: undefined, steps }))).toBe("架空のレポートの見出し")
    expect(
      turnTitle(
        turn({
          request: {
            text: "",
            images: [{ id: "fictional-id", thumbnail: "data:image/png;base64,AA==" }],
          },
          steps,
        }),
      ),
    ).toBe("架空のレポートの見出し")
  })

  it("依頼もレポートも無いときは既定のタイトル", () => {
    expect(turnTitle(turn({ request: undefined, steps: [] }))).toBe("（依頼なし）")
  })
})

describe("requestLinesAfterTitle（タイトルに取られなかった依頼の行）", () => {
  it("1行の依頼では何も残らない", () => {
    expect(requestLinesAfterTitle("架空の依頼")).toEqual([])
  })

  it("複数行の依頼では、タイトルの行より後ろを前後の空行を落として返す", () => {
    expect(requestLinesAfterTitle("架空の依頼\n\n1. 起こす\n\n2. 落ちる\n\n")).toEqual([
      "1. 起こす",
      "",
      "2. 落ちる",
    ])
  })

  it("先頭の空行は、タイトルの行と一緒に読み飛ばす（タイトルと同じ行を二度出さない）", () => {
    expect(requestLinesAfterTitle("\n\n架空の依頼\n続きの行")).toEqual(["続きの行"])
  })

  it("文面が空なら何も残らない", () => {
    expect(requestLinesAfterTitle("")).toEqual([])
  })
})
