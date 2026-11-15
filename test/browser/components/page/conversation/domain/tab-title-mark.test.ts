import { describe, expect, it } from "vitest"

import {
  endedWhileHiddenOf,
  tabTitleMarkOf,
  tabTitleOf,
} from "../../../../../../src/browser/components/page/conversation/domain/tab-title-mark.ts"

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
})
