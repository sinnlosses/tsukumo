import { describe, expect, it } from "vitest"

import type { StepsPhaseRow } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/steps-phase-row.ts"
import {
  type StepsPlanSource,
  stepsPlanCardOf,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/steps-plan-card.ts"
import type {
  CurrentWorkStep,
  CurrentWorkStepGroup,
} from "../../../../../../../../src/browser/features/current-work/current-work-step.ts"

function step(key: string, failed = false): CurrentWorkStep {
  return {
    key,
    label: `Bash: ${key}`,
    nested: false,
    status: { kind: "done", finishedAt: { kind: "restored" } },
    failure: failed
      ? { kind: "failed", outputText: "架空の出力", inputText: "{}" }
      : { kind: "none" },
  }
}

function row(
  index: number,
  state: StepsPhaseRow["state"],
  steps: readonly CurrentWorkStep[] = [],
  milliseconds = 1000,
): StepsPhaseRow {
  const group: CurrentWorkStepGroup = { key: `g${String(index)}`, heading: { kind: "none" }, steps }
  return {
    key: `phase-${String(index)}`,
    phaseIndex: index,
    name: `架空の段${String(index)}`,
    mark: String(index + 1),
    state,
    skipped: false,
    spanName: "",
    parallelLabel: "",
    duration: "",
    measured: { kind: "known", milliseconds },
    summary: state === "done" ? "架空のまとめ" : "",
    groups: [group],
    stepCount: steps.length,
  }
}

function rowsOf(done: number, current: number, upcoming: number): readonly StepsPhaseRow[] {
  return [
    ...Array.from({ length: done }, (_, index) => row(index, "done")),
    ...Array.from({ length: current }, (_, index) =>
      row(done + index, "current", [step("a"), step("b"), step("c"), step("d")]),
    ),
    ...Array.from({ length: upcoming }, (_, index) => row(done + current + index, "upcoming")),
  ]
}

function card(rows: readonly StepsPhaseRow[], overrides: Partial<StepsPlanSource> = {}) {
  return stepsPlanCardOf({
    rows,
    finished: false,
    landing: { kind: "top" },
    doneExpanded: false,
    stepsExpanded: false,
    ...overrides,
  })
}

function shapeOf(items: ReturnType<typeof card>): readonly string[] {
  return items.map((item) => {
    if (item.kind === "done-fold") {
      return `fold:${String(item.count)}:${item.total}`
    }
    if (item.kind === "upcoming-rest") {
      return `rest:${String(item.count)}`
    }
    return `${item.row.state}:${String(item.row.phaseIndex)}`
  })
}

describe("stepsPlanCardOf", () => {
  it("済んだフェーズが2つまでなら畳まない", () => {
    expect(shapeOf(card(rowsOf(0, 1, 0)))).toEqual(["current:0"])
    expect(shapeOf(card(rowsOf(2, 1, 0)))).toEqual(["done:0", "done:1", "current:2"])
  })

  it("済んだフェーズが3つ以上なら1行に畳み、全部測れていれば計の所要を添える", () => {
    expect(shapeOf(card(rowsOf(3, 1, 0)))).toEqual(["fold:3:3秒", "current:3"])
    expect(shapeOf(card(rowsOf(8, 1, 0)))).toEqual(["fold:8:8秒", "current:8"])
  })

  it("測れなかったフェーズがあれば畳みの計は空", () => {
    const rows = [
      row(0, "done"),
      row(1, "done"),
      { ...row(2, "done"), measured: { kind: "unknown" } as const },
      row(3, "current"),
    ]

    expect(shapeOf(card(rows))).toEqual(["fold:3:", "current:3"])
  })

  it("doneExpanded なら畳まない", () => {
    expect(shapeOf(card(rowsOf(3, 1, 0), { doneExpanded: true }))).toEqual([
      "done:0",
      "done:1",
      "done:2",
      "current:3",
    ])
  })

  it("まだのフェーズは3つまで見せ、残りは数で言う", () => {
    expect(shapeOf(card(rowsOf(0, 1, 2)))).toEqual(["current:0", "upcoming:1", "upcoming:2"])
    expect(shapeOf(card(rowsOf(0, 1, 5)))).toEqual([
      "current:0",
      "upcoming:1",
      "upcoming:2",
      "upcoming:3",
      "rest:2",
    ])
  })

  it("完了したら畳まず全行を並べる", () => {
    const rows = [row(0, "done"), row(1, "done"), row(2, "done"), row(3, "done")]

    expect(shapeOf(card(rows, { finished: true }))).toEqual([
      "done:0",
      "done:1",
      "done:2",
      "done:3",
    ])
  })

  it("畳みの中に失敗の行があれば、top なら畳み、failure なら開く", () => {
    const rows = [
      row(0, "done", [step("x", true)]),
      row(1, "done"),
      row(2, "done"),
      row(3, "current"),
    ]

    expect(shapeOf(card(rows, { landing: { kind: "top" } }))[0]).toBe("fold:3:3秒")
    expect(shapeOf(card(rows, { landing: { kind: "failure", signal: 1 } }))[0]).toBe("done:0")
  })

  it("今のフェーズは走っている手順と直前の手順だけを出し、stepsExpanded なら全部を出す", () => {
    const [short] = card(rowsOf(0, 1, 0))
    const [all] = card(rowsOf(0, 1, 0), { stepsExpanded: true })

    expect(short?.kind === "phase" && short.groups[0]?.steps.map((item) => item.key)).toEqual([
      "c",
      "d",
    ])
    expect(short?.kind === "phase" && short.hiddenStepCount).toBe(2)
    expect(all?.kind === "phase" && all.groups[0]?.steps).toHaveLength(4)
    expect(all?.kind === "phase" && all.hiddenStepCount).toBe(0)
  })

  it("failure の着地では、今のフェーズで失敗のあとに2手順以上走っていても全手順を出す", () => {
    const rows = [row(0, "current", [step("a"), step("x", true), step("b"), step("c"), step("d")])]
    const [top] = card(rows, { landing: { kind: "top" } })
    const [failure] = card(rows, { landing: { kind: "failure", signal: 1 } })

    expect(top?.kind === "phase" && top.groups[0]?.steps).toHaveLength(2)
    expect(failure?.kind === "phase" && failure.groups[0]?.steps).toHaveLength(5)
    expect(failure?.kind === "phase" && failure.hiddenStepCount).toBe(0)
  })

  it("「手順 n」は既定ではどのフェーズも畳み、失敗の着地では失敗した手順を持つフェーズだけ開く", () => {
    const rows = [
      row(0, "done", [step("a", true)]),
      row(1, "done", [step("b")]),
      row(2, "current", [step("c", true)]),
    ]
    const openOf = (items: ReturnType<typeof card>) =>
      items.map((item) => item.kind === "phase" && item.open)

    expect(openOf(card(rows, { landing: { kind: "top" } }))).toEqual([false, false, false])
    expect(openOf(card(rows, { landing: { kind: "failure", signal: 1 } }))).toEqual([
      true,
      false,
      true,
    ])
  })

  it("済んだフェーズの行はまとめを持つ", () => {
    const [first] = card(rowsOf(1, 1, 0))

    expect(first?.kind === "phase" && first.row.summary).toBe("架空のまとめ")
  })
})
