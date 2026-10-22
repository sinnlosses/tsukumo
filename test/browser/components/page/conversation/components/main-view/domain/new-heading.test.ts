import { describe, expect, it } from "vitest"

import {
  hasShownInterim,
  headedSectionIdsOfTurn,
  newSectionIdsOf,
  newSectionIdsOfTurn,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/new-heading.ts"
import type {
  MainViewStep,
  MainViewTurn,
} from "../../../../../../../../src/shared/session/main-view-shape.ts"

/** 見出しが空文字の節は、見出しの無い節の欄（ID は並びの位置のまま）。 */
function textStep(
  id: number,
  headings: readonly string[],
  flags: { readonly interim: boolean; readonly final: boolean },
): MainViewStep {
  return {
    id,
    body: {
      kind: "text",
      report: {
        kind: "regions",
        head: "",
        finalHead: "",
        sections: headings.map((heading, index) => ({
          id: index,
          heading,
          markdown: heading === "" ? "架空の本文" : `## ${heading}`,
        })),
        retrospective: "",
        favor: { id: "favor-toolu_fictional", markdown: "" },
      },
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

function sectionsOf(headings: readonly string[]): ReadonlyArray<{ id: number; heading: string }> {
  return headings.map((heading, id) => ({ id, heading }))
}

describe("newSectionIdsOfTurn", () => {
  it("最後の中間と最終の差の欄の ID を返す。最終が決まる前は空", () => {
    const interim = textStep(0, ["一", "二"], { interim: true, final: false })
    const open = textStep(1, ["一", "二", "三"], { interim: false, final: false })
    const closed = textStep(1, ["一", "二", "三"], { interim: false, final: true })

    expect(newSectionIdsOfTurn(turnOf([interim, open]))).toEqual([])
    expect(newSectionIdsOfTurn(turnOf([interim, closed]))).toEqual([2])
  })

  it("見出しの無い節が間に挟まっても、足された節の ID は欄の位置で返す", () => {
    const interim = textStep(0, ["一", ""], { interim: true, final: false })
    const closed = textStep(1, ["", "一", "", "二"], { interim: false, final: true })

    expect(newSectionIdsOfTurn(turnOf([interim, closed]))).toEqual([3])
  })

  it("中間が複数あれば、最後の中間と比べる", () => {
    const first = textStep(0, ["一"], { interim: true, final: false })
    const last = textStep(1, ["一", "二"], { interim: true, final: false })
    const closed = textStep(2, ["一", "二"], { interim: false, final: true })

    expect(newSectionIdsOfTurn(turnOf([first, last, closed]))).toEqual([])
  })

  it("中間が無いやり取りは空で、中間があれば hasShownInterim が立つ", () => {
    const closed = textStep(0, ["一"], { interim: false, final: true })
    const interim = textStep(0, ["一"], { interim: true, final: false })

    expect(newSectionIdsOfTurn(turnOf([closed]))).toEqual([])
    expect(hasShownInterim(turnOf([closed]))).toBe(false)
    expect(hasShownInterim(turnOf([interim]))).toBe(true)
  })
})

describe("headedSectionIdsOfTurn", () => {
  it("見出しのある節の欄の ID を、最終レポートがあればそれから返す", () => {
    const interim = textStep(0, ["一"], { interim: true, final: false })
    const closed = textStep(1, ["", "一", "二"], { interim: false, final: true })

    expect(headedSectionIdsOfTurn(turnOf([interim, closed]))).toEqual([1, 2])
    expect(headedSectionIdsOfTurn(turnOf([interim]))).toEqual([0])
    expect(headedSectionIdsOfTurn(turnOf([]))).toEqual([])
  })
})

describe("newSectionIdsOf", () => {
  const FINAL = sectionsOf(["変わったこと", "確かめたこと", "残った課題"])

  it("中間レポートが無ければ空", () => {
    expect(newSectionIdsOf(undefined, FINAL)).toEqual([])
  })

  it("見出しが同じなら空", () => {
    expect(newSectionIdsOf(FINAL, FINAL)).toEqual([])
  })

  it("足された見出しの欄の ID を返す", () => {
    expect(newSectionIdsOf(sectionsOf(["変わったこと", "確かめたこと"]), FINAL)).toEqual([2])
  })

  it("字が変わった見出しは新しい節として数える", () => {
    expect(
      newSectionIdsOf(sectionsOf(["変わったこと", "確かめた事", "残った課題"]), FINAL),
    ).toEqual([1])
  })

  it.each([
    "`tw accept` の判定",
    "a<b の扱い",
    "R&D の結果",
    "*強調* と _下線_",
    "[リンク](https://example.com) の節",
    "逃がし\\の節",
  ])("記号を含む見出し「%s」は、中間にも最終にもあれば同じ節、無ければ足された節", (heading) => {
    expect(newSectionIdsOf(sectionsOf([heading]), sectionsOf([heading]))).toEqual([])
    expect(newSectionIdsOf(sectionsOf(["別の節"]), sectionsOf([heading]))).toEqual([0])
  })
})
