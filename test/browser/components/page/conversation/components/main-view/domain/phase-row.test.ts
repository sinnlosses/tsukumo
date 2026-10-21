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
} from "../../../../../../../../src/shared/session/main-view-shape.ts"
import {
  phaseLabel,
  phasePosition,
  type PhaseNumber,
  type PhaseSpan,
} from "../../../../../../../../src/shared/session/work-plan-phase-number.ts"
import {
  NO_DELEGATED_RANGE,
  type DelegatedRange,
  type WorkPhase,
} from "../../../../../../../../src/shared/session/work-plan.ts"

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
      headings: [],
      report: `本文${String(id)}`,
      finalReport: `本文${String(id)}`,
      firstLine: overrides.firstLine,
      task: { kind: "none" },
      finishedPhase: overrides.finishedPhase,
      changeSummary: { kind: "none" },
    },
    interim: overrides.interim,
    superseded: false,
    final: !overrides.interim,
    actions: [],
    asides: [],
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
  }
}

const NO_PHASE = { kind: "none" } as const satisfies MainViewPhaseLabel

function phase(label: string, milliseconds: number): MainViewPhaseLabel {
  return { kind: "phase", label, duration: { kind: "known", milliseconds }, skipped: false }
}

const PHASE_NAME = "架空の段の名前"

type LabeledPhase = Extract<WorkPhase, { readonly kind: "phase" }>

function labeled(indexes: readonly number[], count: number, range: DelegatedRange): LabeledPhase {
  return { kind: "phase", indexes, count, name: PHASE_NAME, range }
}

const RANGE: DelegatedRange = { kind: "range", first: 2, count: 3 }

/** `phaseLabel` が返す形。`PhaseNumber` の種類（群の4つと番号なし）ごとに見本を持ち、足すと型が落ちる。 */
const LABELED_PHASES = {
  whole: [
    labeled([1], 4, NO_DELEGATED_RANGE),
    labeled([1, 2], 4, NO_DELEGATED_RANGE),
    labeled([9], 12, NO_DELEGATED_RANGE),
  ],
  lead: [labeled([0], 6, RANGE)],
  delegated: [labeled([3], 6, RANGE), labeled([2, 3], 6, RANGE)],
  trail: [labeled([5], 6, RANGE)],
  named: [labeled([3], 6, { kind: "pending", first: 2 })],
} as const satisfies Record<PhaseSpan | "named", readonly LabeledPhase[]>

function spanKeyOf(number: PhaseNumber): PhaseSpan | "named" {
  return number.kind === "named" ? "named" : number.span
}

describe("phaseRowsOf", () => {
  const rows = phaseRowsOf(
    turn([
      step(0, { interim: true, firstLine: "1/4 計画を立てる", finishedPhase: phase("", 136_000) }),
      step(1, { interim: true, firstLine: "途中の結論", finishedPhase: NO_PHASE }),
      step(2, { interim: false, firstLine: "最終", finishedPhase: NO_PHASE }),
      step(3, {
        interim: true,
        firstLine: "2–3/4 並べて進める",
        finishedPhase: { kind: "phase", label: "", duration: { kind: "unknown" }, skipped: false },
      }),
    ]),
  )

  it("飛ばした段の行だけ skipped が立つ", () => {
    const skippedRows = phaseRowsOf(
      turn([
        step(0, { interim: true, firstLine: "1/2 架空の段A", finishedPhase: phase("", 0) }),
        step(1, {
          interim: true,
          firstLine: "2/2 架空の段B",
          finishedPhase: {
            kind: "phase",
            label: "",
            duration: { kind: "known", milliseconds: 0 },
            skipped: true,
          },
        }),
      ]),
    )

    expect(skippedRows.map((row) => row.skipped)).toEqual([false, true])
  })

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

  it("題の先頭の群の名と位置も外す（範囲の前・本・後の「後 1/3」と、古い記録の「2·3/4」）", () => {
    const titles = phaseRowsOf(
      turn(
        [
          "後 1/3 受け入れる",
          "本 2–3/4 並べて進める",
          "2·3/4 古い記録",
          "2·3·4/5 古い記録の3つ並び",
        ].map((firstLine, id) =>
          step(id, { interim: true, firstLine, finishedPhase: phase("", 1_000) }),
        ),
      ),
    ).map((row) => row.title)

    expect(titles).toEqual(["受け入れる", "並べて進める", "古い記録", "古い記録の3つ並び"])
  })

  it("組む側 phaseLabel が返す形の全部で、位置が残らず段の名前だけが題に残る", () => {
    const titles = Object.entries(LABELED_PHASES).flatMap(([key, phases]) =>
      phases.map((workPhase) => {
        expect(spanKeyOf(phasePosition(workPhase))).toBe(key)
        return phaseRowsOf(
          turn([
            step(0, {
              interim: true,
              firstLine: phaseLabel(workPhase),
              finishedPhase: phase("", 1_000),
            }),
          ]),
        )[0]?.title
      }),
    )

    expect(titles).toHaveLength(Object.values(LABELED_PHASES).flat().length)
    expect(new Set(titles)).toEqual(new Set([PHASE_NAME]))
  })

  it("板の N はワークプランの段の数と一覧の数の大きいほう", () => {
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
