import { describe, expect, it } from "vitest"

import {
  phaseDetailOf,
  type PhaseDetailSource,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/phase-detail.ts"
import type { StepsPhaseRow } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/steps-phase-row.ts"
import type {
  WorkSegmentState,
  WorkStripSegment,
} from "../../../../../../../../src/browser/components/page/conversation/domain/work-segment.ts"
import type {
  CurrentWorkStep,
  CurrentWorkStepGroup,
} from "../../../../../../../../src/browser/features/current-work/current-work-step.ts"

function segment(
  position: number,
  state: WorkSegmentState,
  names: readonly string[] = [`架空の段${String(position)}`],
): WorkStripSegment {
  return {
    key: `segment-${String(position)}`,
    state,
    label: "架空の読み上げ",
    phases: names.map((name, offset) => ({
      index: position + offset,
      name,
      mark: String(position + 1),
      state,
      skipped: false,
      recapKey: `key-${String(position + offset)}`,
    })),
    spanName: "",
    parallelLabel: "",
  }
}

function step(key: string): CurrentWorkStep {
  return {
    key,
    label: `Read: ${key}`,
    nested: false,
    status: { kind: "done", finishedAt: { kind: "restored" } },
    failure: { kind: "none" },
  }
}

function group(key: string, steps: readonly CurrentWorkStep[]): CurrentWorkStepGroup {
  return { key, heading: { kind: "none" }, steps }
}

function row(
  phaseIndex: number,
  groups: readonly CurrentWorkStepGroup[],
  duration = "",
): StepsPhaseRow {
  return {
    key: `phase-${String(phaseIndex)}`,
    phaseIndex,
    name: "",
    mark: "",
    state: "done",
    skipped: false,
    spanName: "",
    parallelLabel: "",
    duration,
    groups,
    stepCount: 0,
    open: false,
  }
}

type SourceOverrides = Partial<Omit<PhaseDetailSource, "segment" | "count" | "previousState">> & {
  readonly segments?: readonly WorkStripSegment[]
}

function source({ segments, ...overrides }: SourceOverrides = {}): PhaseDetailSource {
  const all = segments ?? [segment(0, "done"), segment(1, "current"), segment(2, "upcoming")]
  const index = overrides.index ?? 0
  return {
    segment: all[index] ?? segment(index, "done"),
    index,
    count: all.length,
    previousState: all[index - 1]?.state ?? "none",
    delegatedRange: { kind: "none" },
    phaseTotal: 3,
    recaps: new Map(),
    rows: [],
    ...overrides,
  }
}

describe("phaseDetailOf", () => {
  it("済んだフェーズは見出しに位置・済み・所要を出し、まとめと手順をすべて出す", () => {
    const groups = [group("g0", [step("a"), step("b"), step("c")])]
    const detail = phaseDetailOf(
      source({
        recaps: new Map([
          [
            "key-0",
            { duration: { kind: "known", milliseconds: 48000 }, summary: "架空のまとめ。" },
          ],
        ]),
        rows: [row(0, groups, "48秒")],
      }),
    )

    expect(detail).toMatchObject({
      state: "done",
      name: "架空の段0",
      meta: "1/3 · 済み · 48秒",
      number: "",
      summary: "架空のまとめ。",
      note: "",
    })
    expect(detail?.groups).toEqual(groups)
  })

  it("今のフェーズはまとめを出さず、走っている手順と直前の手順の2つに切る", () => {
    const detail = phaseDetailOf(
      source({
        index: 1,
        rows: [
          row(
            1,
            [group("g1", [step("a"), step("b")]), group("g2", [step("c"), step("d")])],
            "20秒〜",
          ),
        ],
        recaps: new Map([["key-1", { duration: { kind: "unknown" }, summary: "まだ書かれない" }]]),
      }),
    )

    expect(detail?.meta).toBe("2/3 · いま · 20秒〜")
    expect(detail?.summary).toBe("")
    expect(detail?.groups.map((entry) => entry.steps.map((entered) => entered.key))).toEqual([
      ["c", "d"],
    ])
  })

  it("答え待ちのフェーズは「答え待ち」と言う", () => {
    const detail = phaseDetailOf(
      source({ segments: [segment(0, "done"), segment(1, "asking")], index: 1 }),
    )

    expect(detail?.meta).toBe("2/2 · 答え待ち")
  })

  it("まだのフェーズは名前と一言だけで、次のフェーズとその先で一言が違う", () => {
    const next = phaseDetailOf(source({ index: 2 }))
    const later = phaseDetailOf(
      source({
        segments: [segment(0, "current"), segment(1, "upcoming"), segment(2, "upcoming")],
        index: 2,
      }),
    )

    expect(next).toMatchObject({
      meta: "3/3 · これから",
      note: "今のフェーズが済んだら始めます。",
      groups: [],
      summary: "",
    })
    expect(later?.note).toBe("まだ始めていません。")
  })

  it("並列の区間は名前を「・」でつなぐ", () => {
    const detail = phaseDetailOf(
      source({ segments: [segment(0, "current", ["段X", "段Y"])], index: 0 }),
    )

    expect(detail?.name).toBe("段X・段Y")
  })

  it("委譲の範囲の中のフェーズだけ群の番号「本 2」を添える", () => {
    const range = { kind: "range", first: 1, count: 2 } as const
    const inside = phaseDetailOf(source({ index: 2, delegatedRange: range }))
    const outside = phaseDetailOf(source({ index: 0, delegatedRange: range }))

    expect(inside?.number).toBe("本 2")
    expect(outside?.number).toBe("")
  })
})
