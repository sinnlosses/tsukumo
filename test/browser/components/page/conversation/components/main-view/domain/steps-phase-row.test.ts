import { describe, expect, it } from "vitest"

import {
  type StepsPhaseSlotSource,
  type StepsPhaseSource,
  stepsPhaseRowsOf,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/steps-phase-row.ts"
import type {
  CurrentWorkStep,
  CurrentWorkStepGroup,
} from "../../../../../../../../src/browser/features/current-work/current-work-step.ts"

function phase(index: number, overrides: Partial<StepsPhaseSource> = {}): StepsPhaseSource {
  return {
    index,
    name: `架空の段${String(index)}`,
    mark: String(index + 1),
    state: "upcoming",
    skipped: false,
    duration: { kind: "unknown" },
    summary: "",
    ...overrides,
  }
}

function slot(
  phases: readonly StepsPhaseSource[],
  overrides: Partial<StepsPhaseSlotSource> = {},
): StepsPhaseSlotSource {
  return { spanName: "", parallelLabel: "", phases, ...overrides }
}

function step(key: string, failed = false): CurrentWorkStep {
  return {
    key,
    label: `Bash: ${key}`,
    nested: false,
    status: failed
      ? {
          kind: "failed",
          output: { head: "架空の出力", omittedLength: 0 },
          finishedAt: { kind: "restored" },
        }
      : { kind: "done", finishedAt: { kind: "restored" } },
    failure: failed
      ? { kind: "failed", outputText: "架空の出力", inputText: "{}" }
      : { kind: "none" },
  }
}

function group(
  key: string,
  indexes: readonly number[] | undefined,
  steps: readonly CurrentWorkStep[],
): CurrentWorkStepGroup {
  return {
    key,
    heading:
      indexes === undefined
        ? { kind: "none" }
        : { kind: "phase", spanName: "", label: "架空", phaseIndexes: indexes },
    steps,
  }
}

describe("stepsPhaseRowsOf", () => {
  it("手順の無いフェーズも含め、全フェーズを並びの順に1行ずつ出す。これからのフェーズは手順も所要も持たない", () => {
    const { rows } = stepsPhaseRowsOf(
      [
        slot([
          phase(0, { state: "done", mark: "✓", duration: { kind: "known", milliseconds: 48000 } }),
        ]),
        slot([phase(1, { state: "current", duration: { kind: "known", milliseconds: 20000 } })]),
        slot([phase(2)]),
      ],
      [group("g1", [1], [step("s1")])],
    )

    expect(rows.map((row) => [row.name, row.mark, row.duration, row.stepCount])).toEqual([
      ["架空の段0", "✓", "48秒", 0],
      ["架空の段1", "2", "20秒〜", 1],
      ["架空の段2", "3", "", 0],
    ])
  })

  it("まとめは済んだ行にだけ写る", () => {
    const { rows } = stepsPhaseRowsOf(
      [
        slot([phase(0, { state: "done", summary: "架空のまとめ" })]),
        slot([phase(1, { state: "current", summary: "架空のまとめ" })]),
      ],
      [],
    )

    expect(rows.map((row) => row.summary)).toEqual(["架空のまとめ", ""])
  })

  it("飛ばしたフェーズは所要を出さず印を持ち越し、並列のフェーズと群の名は先頭の行だけが持つ", () => {
    const { rows } = stepsPhaseRowsOf(
      [
        slot(
          [
            phase(0, {
              state: "done",
              skipped: true,
              mark: "/",
              duration: { kind: "known", milliseconds: 1000 },
            }),
          ],
          {
            spanName: "前",
          },
        ),
        slot([phase(1), phase(2)], { parallelLabel: "並列 2" }),
      ],
      [],
    )

    expect(
      rows.map((row) => [row.mark, row.skipped, row.duration, row.spanName, row.parallelLabel]),
    ).toEqual([
      ["/", true, "", "前", ""],
      ["2", false, "", "", "並列 2"],
      ["3", false, "", "", ""],
    ])
  })

  it("並列のフェーズをまたぐ群は先頭の行に1回だけ付け、行に付かない群は rest に残す", () => {
    const shared = group("g", [1, 2], [step("a")])
    const before = group("before", undefined, [step("b")])
    const { rows, rest } = stepsPhaseRowsOf(
      [slot([phase(1, { state: "current" }), phase(2, { state: "current" })])],
      [shared, before],
    )

    expect(rows.map((row) => row.groups.map((g) => g.key))).toEqual([["g"], []])
    expect(rows[0]?.groups[0]?.heading.kind).toBe("none")
    expect(rest.map((g) => g.key)).toEqual(["before"])
  })

  it("ワークプランの無い依頼は行を持たず、群をそのまま rest に返す", () => {
    const groups = [group("g", undefined, [step("a")])]

    expect(stepsPhaseRowsOf([], groups)).toEqual({ rows: [], rest: groups })
  })
})
