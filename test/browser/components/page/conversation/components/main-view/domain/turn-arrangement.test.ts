import { describe, expect, it } from "vitest"

import {
  arrangeTurn,
  progressFoldSummary,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/turn-arrangement.ts"
import type {
  MainViewAside,
  MainViewPhaseLabel,
  MainViewQuestion,
  MainViewStep,
  MainViewTurn,
  MainViewTurnFailure,
} from "../../../../../../../../src/shared/session/main-view-shape.ts"

type StepShape = {
  readonly kind: "interim" | "final" | "empty"
  readonly finishedPhase: MainViewPhaseLabel
  readonly questions: readonly MainViewQuestion[]
  readonly asides: readonly MainViewAside[]
}

const NO_PHASE = { kind: "none" } as const satisfies MainViewPhaseLabel

const PLAIN = {
  finishedPhase: NO_PHASE,
  questions: [],
  asides: [],
} as const satisfies Omit<StepShape, "kind">

function step(id: number, shape: StepShape): MainViewStep {
  return {
    id,
    body:
      shape.kind === "empty"
        ? { kind: "none" }
        : {
            kind: "text",
            report: { kind: "markdown", markdown: `本文${String(id)}` },
            firstLine: `先頭${String(id)}`,
            task: { kind: "none" },
            finishedPhase: shape.finishedPhase,
            changeSummary: { kind: "none" },
          },
    interim: shape.kind === "interim",
    superseded: shape.kind === "interim",
    final: shape.kind === "final",
    actions: shape.questions,
    asides: shape.asides,
  }
}

function turn(
  steps: readonly MainViewStep[],
  failure: MainViewTurnFailure = { kind: "none" },
): MainViewTurn {
  return {
    id: 1,
    request: { text: "架空の依頼", images: [] },
    steps,
    hasInterimReport: steps.some((entry) => entry.interim),
    droppedCount: 0,
    failure,
  }
}

function question(toolUseId: string): MainViewQuestion {
  return { kind: "question", toolUseId, questions: [], answers: [] }
}

function aside(text: string): MainViewAside {
  return { text, answer: { kind: "waiting" } }
}

function phase(label: string, duration: number | "unknown"): MainViewPhaseLabel {
  return {
    kind: "phase",
    label,
    duration:
      duration === "unknown" ? { kind: "unknown" } : { kind: "known", milliseconds: duration },
    skipped: false,
  }
}

describe("arrangeTurn", () => {
  it("最終レポートの無いやり取り（働くあいだ）は届いた順のまま", () => {
    expect(
      arrangeTurn(
        turn([step(0, { kind: "interim", ...PLAIN }), step(1, { kind: "interim", ...PLAIN })]),
      ),
    ).toEqual({ kind: "arrival" })
  })

  it("最終レポートの無いまま失敗で閉じたやり取りも届いた順のまま", () => {
    expect(
      arrangeTurn(
        turn([step(0, { kind: "interim", ...PLAIN })], {
          kind: "failed",
          failure: { kind: "max-turns" },
        }),
      ),
    ).toEqual({ kind: "arrival" })
  })

  it("中間レポートが無ければ、最終レポートだけで経過は空", () => {
    const final = step(0, { kind: "final", ...PLAIN })
    expect(arrangeTurn(turn([final]))).toEqual({
      kind: "final-first",
      final,
      besides: [],
      progress: [],
    })
  })

  it("中間レポートが1件なら、経過に1件入る", () => {
    const interim = step(0, { kind: "interim", ...PLAIN })
    const final = step(1, { kind: "final", ...PLAIN })
    expect(arrangeTurn(turn([interim, final]))).toEqual({
      kind: "final-first",
      final,
      besides: [],
      progress: [interim],
    })
  })

  it("中間レポートが何件あっても、経過には届いた順に入り、本文の無いステップは入らない", () => {
    const steps = [
      step(0, { kind: "empty", ...PLAIN }),
      step(1, { kind: "interim", ...PLAIN }),
      step(2, { kind: "interim", ...PLAIN }),
      step(3, { kind: "interim", ...PLAIN }),
      step(4, { kind: "final", ...PLAIN }),
    ]
    const arrangement = arrangeTurn(turn(steps))
    expect(
      arrangement.kind === "final-first" && arrangement.progress.map((entry) => entry.id),
    ).toEqual([1, 2, 3])
  })

  it("脇の話は経過に入れず、中間と最終のステップの分を送った順に besides へ並べる", () => {
    const first = aside("中間のあとの問い")
    const second = aside("最終のあとの問い")
    const interim = step(0, { kind: "interim", ...PLAIN, asides: [first] })
    const final = step(1, { kind: "final", ...PLAIN, asides: [second] })
    expect(arrangeTurn(turn([interim, final]))).toEqual({
      kind: "final-first",
      final,
      besides: [
        { kind: "asides", stepId: 0, asides: [first] },
        { kind: "asides", stepId: 1, asides: [second] },
      ],
      progress: [interim],
    })
  })

  it("中間と本文の無いステップの質問の記録は besides へ出し、最終のステップの質問は出さない", () => {
    const early = question("q0")
    const middle = question("q1")
    const last = question("q2")
    const arrangement = arrangeTurn(
      turn([
        step(0, { kind: "empty", ...PLAIN, questions: [early] }),
        step(1, { kind: "interim", ...PLAIN, questions: [middle] }),
        step(2, { kind: "final", ...PLAIN, questions: [last] }),
      ]),
    )
    expect(arrangement.kind === "final-first" && arrangement.besides).toEqual([
      { kind: "question", entry: early },
      { kind: "question", entry: middle },
    ])
  })
})

describe("progressFoldSummary", () => {
  it("段のまとめが無ければ件数だけ", () => {
    expect(
      progressFoldSummary([
        step(0, { kind: "interim", ...PLAIN }),
        step(1, { kind: "interim", ...PLAIN }),
      ]),
    ).toBe("経過 2 件")
  })

  it("段のまとめがあれば、合計の所要と段ごとの所要を届いた順に添える", () => {
    expect(
      progressFoldSummary([
        step(0, { kind: "interim", ...PLAIN, finishedPhase: phase("1/3 今の形を調べる", 9_000) }),
        step(1, { kind: "interim", ...PLAIN, finishedPhase: phase("2/3 読み口を作る", 72_000) }),
        step(2, { kind: "interim", ...PLAIN, finishedPhase: phase("3/3 検証", 44_000) }),
      ]),
    ).toBe(
      "経過 3 件 · 所要 2分05秒（1/3 今の形を調べる 9秒 · 2/3 読み口を作る 1分12秒 · 3/3 検証 44秒）",
    )
  })

  it("測れなかった段が混じれば合計を出さず、その段は「不明」", () => {
    expect(
      progressFoldSummary([
        step(0, { kind: "interim", ...PLAIN, finishedPhase: phase("1/2 架空の段A", 3_000) }),
        step(1, { kind: "interim", ...PLAIN, finishedPhase: phase("2/2 架空の段B", "unknown") }),
      ]),
    ).toBe("経過 2 件（1/2 架空の段A 3秒 · 2/2 架空の段B 不明）")
  })

  it("飛ばした段は所要の前に「飛ばした」を添える", () => {
    expect(
      progressFoldSummary([
        step(0, {
          kind: "interim",
          ...PLAIN,
          finishedPhase: {
            kind: "phase",
            label: "1/1 架空の段",
            duration: { kind: "known", milliseconds: 0 },
            skipped: true,
          },
        }),
      ]),
    ).toBe("経過 1 件 · 所要 0秒（1/1 架空の段 飛ばした 0秒）")
  })
})
