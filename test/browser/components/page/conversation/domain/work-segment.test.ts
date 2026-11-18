import { describe, expect, it } from "vitest"

import {
  doneSegmentCountOf,
  workSegmentsOf,
} from "../../../../../../src/browser/components/page/conversation/domain/work-segment.ts"
import type {
  LatestWorkPlan,
  WorkPlan,
  WorkPlanEntry,
} from "../../../../../../src/shared/session/work-plan.ts"

function planOf(phases: readonly WorkPlanEntry[], rest: Partial<WorkPlan> = {}): LatestWorkPlan {
  return {
    kind: "planned",
    phases,
    phaseIds: [],
    current: 0,
    finishedInGroup: [],
    phaseSummary: "",
    delegatedRange: { kind: "none" },
    skippedPhases: [],
    awaitingSummary: { kind: "none" },
    ...rest,
  }
}

const WORKING = { asking: false, finished: false }

describe("workSegmentsOf", () => {
  it("並列のフェーズは今が2つでも区間1つで、位置は1つ、読み上げの名前は済んでいない段を「・」でつなぐ", () => {
    const { segments, position } = workSegmentsOf(
      planOf(["段A", ["段B", "段C"], "段D", "段E"], { current: 1, finishedInGroup: [] }),
      WORKING,
    )

    expect(segments).toHaveLength(4)
    expect(position).toEqual({ kind: "shown", text: "2/4" })
    expect(segments[1]?.label).toBe("フェーズ 2/4 段B・段C（いま）")
    expect(segments[0]?.label).toBe("フェーズ 1/4 段A（済み）")
    expect(segments[2]?.label).toBe("フェーズ 3/4 段D（これから）")
  })

  it("並列の中で1つ済んだら、読み上げの名前は残りの段だけ", () => {
    const { segments } = workSegmentsOf(
      planOf([["段B", "段C"], "段D"], { current: 0, finishedInGroup: ["段B"] }),
      WORKING,
    )

    expect(segments[0]?.label).toBe("フェーズ 1/2 段C（いま）")
  })

  it("範囲が未定のあいだ、範囲は区間1つで、名前はその要素の名前のまま", () => {
    const { segments, position } = workSegmentsOf(
      planOf(["架空の計画", "架空の段", "架空の受け入れ"], {
        current: 1,
        delegatedRange: { kind: "pending", first: 1 },
      }),
      WORKING,
    )

    expect(segments).toHaveLength(3)
    expect(segments[1]?.label).toBe("フェーズ 2/3 架空の段（いま）")
    expect(position).toEqual({ kind: "shown", text: "2/3" })
  })

  it("ワークプランの無いターンは区間1つで位置を出さない", () => {
    const { segments, position } = workSegmentsOf({ kind: "none" }, WORKING)

    expect(segments).toHaveLength(1)
    expect(segments[0]?.state).toBe("current")
    expect(position).toEqual({ kind: "none" })
  })

  it("12フェーズで今が8つ目なら、区間12・位置「8/12」", () => {
    const names = Array.from({ length: 12 }, (_, index) => `段${String(index + 1)}`)
    const { segments, position } = workSegmentsOf(planOf(names, { current: 7 }), WORKING)

    expect(segments).toHaveLength(12)
    expect(segments.filter((segment) => segment.state === "done")).toHaveLength(7)
    expect(position).toEqual({ kind: "shown", text: "8/12" })
  })

  it("全部済んだら位置を出さず、区間は全部済み", () => {
    const { segments, position } = workSegmentsOf(planOf(["段A", "段B"], { current: 2 }), {
      asking: false,
      finished: true,
    })

    expect(segments.map((segment) => segment.state)).toEqual(["done", "done"])
    expect(position).toEqual({ kind: "none" })
  })

  it("途中で閉じたワークプランでも、完了の帯は位置を出さず区間は全部済み", () => {
    const { segments, position } = workSegmentsOf(
      planOf(["段A", "段B", "段C", "段D"], { current: 1 }),
      { asking: false, finished: true },
    )

    expect(segments.map((segment) => segment.state)).toEqual(["done", "done", "done", "done"])
    expect(position).toEqual({ kind: "none" })
  })

  it("答え待ちのとき、今の区間は asking", () => {
    const { segments } = workSegmentsOf(planOf(["段A", "段B"]), { asking: true, finished: false })

    expect(segments.map((segment) => segment.state)).toEqual(["asking", "upcoming"])
  })
})

describe("doneSegmentCountOf", () => {
  it("今の位置が済んだ区間の数で、ワークプランが無ければ 0", () => {
    expect(doneSegmentCountOf(planOf(["段A", ["段B", "段C"], "段D"], { current: 2 }))).toBe(2)
    expect(doneSegmentCountOf({ kind: "none" })).toBe(0)
  })
})
