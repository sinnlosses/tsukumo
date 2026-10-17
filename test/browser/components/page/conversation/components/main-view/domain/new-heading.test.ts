import { describe, expect, it } from "vitest"

import {
  hasShownInterim,
  newSectionIndexesOf,
  newSectionIndexesOfTurn,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/new-heading.ts"
import type {
  MainViewStep,
  MainViewTurn,
} from "../../../../../../../../src/shared/session/main-view.ts"

function textStep(
  id: number,
  headings: readonly string[],
  flags: { readonly interim: boolean; readonly final: boolean },
): MainViewStep {
  return {
    id,
    body: {
      kind: "text",
      headings,
      report: "",
      finalReport: "",
      firstLine: "",
      task: { kind: "none" },
      finishedPhase: { kind: "none" },
      changeSummary: { kind: "none" },
    },
    interim: flags.interim,
    superseded: false,
    final: flags.final,
    actions: [],
    asides: [],
  }
}

function turnOf(steps: readonly MainViewStep[]): MainViewTurn {
  return {
    id: 0,
    request: undefined,
    steps,
    hasInterimReport: steps.some((step) => step.interim),
    droppedCount: 0,
    failure: { kind: "none" },
  }
}

describe("newSectionIndexesOfTurn", () => {
  it("最後の中間と最終の差の位置を返す。最終が決まる前は空", () => {
    const interim = textStep(0, ["一", "二"], { interim: true, final: false })
    const open = textStep(1, ["一", "二", "三"], { interim: false, final: false })
    const closed = textStep(1, ["一", "二", "三"], { interim: false, final: true })

    expect(newSectionIndexesOfTurn(turnOf([interim, open]))).toEqual([])
    expect(newSectionIndexesOfTurn(turnOf([interim, closed]))).toEqual([2])
  })

  it("中間が複数あれば、最後の中間と比べる", () => {
    const first = textStep(0, ["一"], { interim: true, final: false })
    const last = textStep(1, ["一", "二"], { interim: true, final: false })
    const closed = textStep(2, ["一", "二"], { interim: false, final: true })

    expect(newSectionIndexesOfTurn(turnOf([first, last, closed]))).toEqual([])
  })

  it("中間が無いやり取りは空で、中間があれば hasShownInterim が立つ", () => {
    const closed = textStep(0, ["一"], { interim: false, final: true })
    const interim = textStep(0, ["一"], { interim: true, final: false })

    expect(newSectionIndexesOfTurn(turnOf([closed]))).toEqual([])
    expect(hasShownInterim(turnOf([closed]))).toBe(false)
    expect(hasShownInterim(turnOf([interim]))).toBe(true)
  })
})

describe("newSectionIndexesOf", () => {
  const FINAL = ["変わったこと", "確かめたこと", "残った課題"]

  it("中間レポートが無ければ空", () => {
    expect(newSectionIndexesOf(undefined, FINAL)).toEqual([])
  })

  it("見出しが同じなら空", () => {
    expect(newSectionIndexesOf(FINAL, FINAL)).toEqual([])
  })

  it("足された見出しの位置を返す", () => {
    expect(newSectionIndexesOf(["変わったこと", "確かめたこと"], FINAL)).toEqual([2])
  })

  it("字が変わった見出しは新しい節として数える", () => {
    expect(newSectionIndexesOf(["変わったこと", "確かめた事", "残った課題"], FINAL)).toEqual([1])
  })

  it.each([
    "`tw accept` の判定",
    "a<b の扱い",
    "R&D の結果",
    "*強調* と _下線_",
    "[リンク](https://example.com) の節",
    "逃がし\\の節",
  ])("記号を含む見出し「%s」は、中間にも最終にもあれば同じ節、無ければ足された節", (heading) => {
    expect(newSectionIndexesOf([heading], [heading])).toEqual([])
    expect(newSectionIndexesOf(["別の節"], [heading])).toEqual([0])
  })
})
