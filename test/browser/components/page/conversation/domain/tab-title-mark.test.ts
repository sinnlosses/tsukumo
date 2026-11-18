import { describe, expect, it } from "vitest"

import {
  endedWhileHiddenOf,
  tabTitleMarkOf,
  tabTitleOf,
  tabTitleProgressOf,
} from "../../../../../../src/browser/components/page/conversation/domain/tab-title-mark.ts"
import { GROUPED, PHASES, planned } from "../../../../../fixture/work-plan-draft.ts"

describe("tabTitleMarkOf", () => {
  it("答え待ちがあれば、ほかの状態より先に「●」", () => {
    expect(
      tabTitleMarkOf({ pendingActive: true, newestResult: "working", endedWhileHidden: true }),
    ).toBe("●")
  })

  it("作業中は「…」、失敗は「✕」", () => {
    expect(
      tabTitleMarkOf({ pendingActive: false, newestResult: "working", endedWhileHidden: false }),
    ).toBe("…")
    expect(
      tabTitleMarkOf({ pendingActive: false, newestResult: "failed", endedWhileHidden: false }),
    ).toBe("✕")
  })

  it("完了と止めたは、隠れているあいだに終わったときだけ「✓」「‖」", () => {
    expect(
      tabTitleMarkOf({ pendingActive: false, newestResult: "done", endedWhileHidden: true }),
    ).toBe("✓")
    expect(
      tabTitleMarkOf({ pendingActive: false, newestResult: "stopped", endedWhileHidden: true }),
    ).toBe("‖")
    expect(
      tabTitleMarkOf({ pendingActive: false, newestResult: "done", endedWhileHidden: false }),
    ).toBe("")
    expect(
      tabTitleMarkOf({ pendingActive: false, newestResult: "stopped", endedWhileHidden: false }),
    ).toBe("")
  })

  it("それ以外は印なし", () => {
    expect(
      tabTitleMarkOf({ pendingActive: false, newestResult: "no-report", endedWhileHidden: true }),
    ).toBe("")
    expect(
      tabTitleMarkOf({
        pendingActive: false,
        newestResult: "awaiting-answer",
        endedWhileHidden: true,
      }),
    ).toBe("")
  })
})

describe("endedWhileHiddenOf", () => {
  it("作業中から完了へ、隠れているあいだに変われば真", () => {
    expect(endedWhileHiddenOf("working", "done", true)).toBe(true)
    expect(endedWhileHiddenOf("awaiting-answer", "stopped", true)).toBe(true)
  })

  it("見ているあいだに終わった・読み込み直後は偽", () => {
    expect(endedWhileHiddenOf("working", "done", false)).toBe(false)
    expect(endedWhileHiddenOf("no-report", "done", true)).toBe(false)
    expect(endedWhileHiddenOf("done", "done", true)).toBe(false)
  })

  it("完了・止めた以外へ変わるなら偽", () => {
    expect(endedWhileHiddenOf("working", "failed", true)).toBe(false)
  })
})

describe("tabTitleOf", () => {
  it("印があれば頭に付け、無ければ元の題", () => {
    expect(tabTitleOf("題", "…")).toBe("… 題")
    expect(tabTitleOf("題", "")).toBe("題")
  })

  it("足す文があれば印と元の題のあいだに挟み、印が無ければ足さない", () => {
    expect(tabTitleOf("題", "…", "2/4 名前")).toBe("… 2/4 名前 · 題")
    expect(tabTitleOf("題", "", "2/4 名前")).toBe("題")
  })
})

describe("tabTitleProgressOf", () => {
  const working = { pendingActive: false, newestResult: "working" } as const

  it("作業中でワークプランがあれば、位置と今のフェーズの名前", () => {
    expect(tabTitleProgressOf({ ...working, plan: planned(PHASES, 1) })).toBe("2/3 架空の段B")
  })

  it("並列のフェーズは、区間で数えた位置と名前を「・」でつなぐ", () => {
    expect(tabTitleProgressOf({ ...working, plan: planned(GROUPED, 1) })).toBe(
      "2/3 架空の段B・架空の段C",
    )
  })

  it("ワークプランが無い作業中は空", () => {
    expect(tabTitleProgressOf({ ...working, plan: { kind: "none" } })).toBe("")
  })

  it("答え待ち・失敗・完了・止めた・答え無しは空", () => {
    const plan = planned(PHASES, 1)
    expect(tabTitleProgressOf({ ...working, pendingActive: true, plan })).toBe("")
    for (const newestResult of ["failed", "done", "stopped", "no-report"] as const) {
      expect(tabTitleProgressOf({ pendingActive: false, newestResult, plan })).toBe("")
    }
  })
})
