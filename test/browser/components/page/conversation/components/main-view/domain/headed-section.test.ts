import { describe, expect, it } from "vitest"

import { headedSectionIdsOfTurn } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/headed-section.ts"
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

describe("headedSectionIdsOfTurn", () => {
  it("見出しのある節の欄の ID を、最終レポートがあればそれから返す", () => {
    const interim = textStep(0, ["一"], { interim: true, final: false })
    const closed = textStep(1, ["", "一", "二"], { interim: false, final: true })

    expect(headedSectionIdsOfTurn(turnOf([interim, closed]))).toEqual([1, 2])
    expect(headedSectionIdsOfTurn(turnOf([interim]))).toEqual([0])
    expect(headedSectionIdsOfTurn(turnOf([]))).toEqual([])
  })

  it("同じ MainViewTurn の2回目は覚えた結果をそのまま返す（抽出が1回）", () => {
    const interim = textStep(0, ["一"], { interim: true, final: false })
    const closed = textStep(1, ["一", "二"], { interim: false, final: true })
    const turn = turnOf([interim, closed])

    expect(headedSectionIdsOfTurn(turn)).toBe(headedSectionIdsOfTurn(turn))
  })
})
