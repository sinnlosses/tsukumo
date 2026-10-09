import { describe, expect, it } from "vitest"

import {
  neighborRow,
  phaseRowsOf,
  phaseTotal,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/phase-row.ts"
import type {
  MainViewPhaseLabel,
  MainViewStep,
  MainViewTurn,
} from "../../../../../../../../src/shared/session/main-view.ts"

function step(
  id: number,
  overrides: {
    readonly interim: boolean
    readonly firstLine: string
    readonly finishedPhase: MainViewPhaseLabel
  },
): MainViewStep {
  return {
    id,
    body: {
      kind: "text",
      report: `本文${String(id)}`,
      finalReport: `本文${String(id)}`,
      firstLine: overrides.firstLine,
      task: { kind: "none" },
      finishedPhase: overrides.finishedPhase,
    },
    interim: overrides.interim,
    superseded: false,
    final: !overrides.interim,
    actions: [],
  }
}

function turn(steps: readonly MainViewStep[]): MainViewTurn {
  return {
    id: 1,
    request: { text: "架空の依頼", images: [] },
    steps,
    hasInterimReport: true,
    droppedCount: 0,
    failure: { kind: "none" },
    asides: [],
  }
}

const NO_PHASE = { kind: "none" } as const satisfies MainViewPhaseLabel

function phase(label: string, milliseconds: number): MainViewPhaseLabel {
  return { kind: "phase", label, duration: { kind: "known", milliseconds } }
}

describe("phaseRowsOf", () => {
  const rows = phaseRowsOf(
    turn([
      step(0, { interim: true, firstLine: "1/4 計画を立てる", finishedPhase: phase("", 136_000) }),
      step(1, { interim: true, firstLine: "途中の結論", finishedPhase: NO_PHASE }),
      step(2, { interim: false, firstLine: "最終", finishedPhase: NO_PHASE }),
      step(3, {
        interim: true,
        firstLine: "2·3/4 並べて進める",
        finishedPhase: { kind: "phase", label: "", duration: { kind: "unknown" } },
      }),
    ]),
  )

  it("中間レポートだけを古い順に1から数え、最終レポートは含めない", () => {
    expect(rows.map((row) => [row.number, row.stepId])).toEqual([
      [1, 0],
      [2, 1],
      [3, 3],
    ])
  })

  it("段のまとめは題の先頭の位置を外し、所要を「m:ss」で持つ。report の途中の本文は題をそのまま使い所要は空", () => {
    expect(rows.map((row) => row.title)).toEqual(["計画を立てる", "途中の結論", "並べて進める"])
    expect(rows.map((row) => row.duration)).toEqual(["2:16", "", ""])
  })

  it("板の N は段取りの段の数と一覧の数の大きいほう", () => {
    expect(phaseTotal(rows, 5)).toBe(5)
    expect(phaseTotal(rows, 0)).toBe(3)
    expect(phaseTotal(rows, 2)).toBe(3)
  })

  it("前後の行を引き、端では none を返す", () => {
    expect(neighborRow(rows, 1, "previous")).toMatchObject({ kind: "row", row: { stepId: 0 } })
    expect(neighborRow(rows, 1, "next")).toMatchObject({ kind: "row", row: { stepId: 3 } })
    expect(neighborRow(rows, 0, "previous")).toEqual({ kind: "none" })
    expect(neighborRow(rows, 3, "next")).toEqual({ kind: "none" })
    expect(neighborRow(rows, 99, "next")).toEqual({ kind: "none" })
  })
})
