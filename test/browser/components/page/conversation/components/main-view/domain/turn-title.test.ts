import { describe, expect, it } from "vitest"

import {
  turnRequestRest,
  turnTitle,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/turn-title.ts"
import type {
  MainViewStep,
  MainViewTurn,
} from "../../../../../../../../src/shared/session/main-view.ts"

// フィクスチャはすべて手で書いた架空の依頼とレポート（実物の会話は使わない）。

function reportStep(id: number, firstLine: string): MainViewStep {
  return {
    id,
    body: {
      kind: "text",
      report: firstLine,
      firstLine,
      task: { kind: "none" },
      finishedPhase: { kind: "none" },
    },
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

  it("先頭の空行と行の中の空白の並びを詰める", () => {
    expect(turnTitle(turn({ request: { text: "\n\n  架空の   依頼 ", images: [] } }))).toBe(
      "架空の 依頼",
    )
  })

  it("行頭の引用の記号（重ねてあっても全部）はタイトルに出さない", () => {
    expect(turnTitle(turn({ request: { text: "> 架空の依頼", images: [] } }))).toBe("架空の依頼")
    expect(turnTitle(turn({ request: { text: "> > 二重の引用", images: [] } }))).toBe("二重の引用")
  })

  it("記号だけの行はタイトルにならず、次の行がタイトルになる", () => {
    expect(turnTitle(turn({ request: { text: ">\n> 架空の依頼", images: [] } }))).toBe("架空の依頼")
  })

  it("記号のあとに空白が無い行（>foo）は落とさない", () => {
    expect(turnTitle(turn({ request: { text: ">foo", images: [] } }))).toBe(">foo")
  })

  it("レポートの先頭行へ下りたときは、引用の記号を落とさない", () => {
    const steps = [reportStep(0, "> 架空の引用")]

    expect(turnTitle(turn({ request: undefined, steps }))).toBe("> 架空の引用")
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
})

describe("turnRequestRest（タイトルの下に出す依頼の続き）", () => {
  function rest(text: string): readonly string[] {
    return turnRequestRest(turn({ request: { text, images: [] } }))
  }

  it("1行の依頼では何も残らない", () => {
    expect(rest("架空の依頼")).toEqual([])
  })

  it("複数行の依頼では、タイトルの行より後ろを前後の空行を落として返す", () => {
    expect(rest("架空の依頼\n\n1. 起こす\n\n2. 落ちる\n\n")).toEqual(["1. 起こす", "", "2. 落ちる"])
  })

  it("先頭の空行は、タイトルの行と一緒に読み飛ばす（タイトルと同じ行を二度出さない）", () => {
    expect(rest("\n\n架空の依頼\n続きの行")).toEqual(["続きの行"])
  })

  it("続きの行の頭の引用の記号も落とし、字下げは残す", () => {
    expect(rest("> 架空の依頼\n> 続きの行\n>   - 字下げ")).toEqual(["続きの行", "  - 字下げ"])
  })

  it("文面が空・依頼が無いときは何も残らない", () => {
    expect(rest("")).toEqual([])
    expect(turnRequestRest(turn({ request: undefined }))).toEqual([])
  })

  it("長い依頼は上限で切った続きになる", () => {
    const long = `見出し\n${"あ".repeat(2001)}`

    expect(rest(long)).toEqual([`${"あ".repeat(1996)}…`])
  })
})
