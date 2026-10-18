import { describe, expect, it } from "vitest"

import {
  completionText,
  phaseLabel,
  phaseNumberOf,
  plannedPhaseTitle,
  workPositionText,
} from "../../../src/shared/session/work-plan-phase-number.ts"
import {
  currentPhaseOf,
  type LatestWorkPlan,
  type WorkPhase,
  type WorkPlan,
  type WorkPlanEntry,
} from "../../../src/shared/session/work-plan.ts"
import { GROUPED, next } from "../../fixture/work-plan-draft.ts"

describe("phaseNumberOf", () => {
  const none = { kind: "none" } as const
  // GROUPED を平らにすると A=0, B=1, C=2, D=3。範囲は B・C・D（先頭 1、3 段）
  const range = { kind: "range", first: 1, count: 3 } as const

  // 前・本・後の3群。前は計画（0）、本は段B〜D（1〜3）、後は受け入れ・振り返り・送り出し（4〜6）
  const SPANNED: readonly WorkPlanEntry[] = [
    "架空の計画",
    "架空の段B",
    "架空の段C",
    "架空の段D",
    "架空の受け入れ",
    "架空の振り返り",
    "架空の送り出し",
  ]
  const spannedRange = { kind: "range", first: 1, count: 3 } as const

  it("範囲が無ければ並び全体の通し番号と全体の段の数で数える", () => {
    expect(phaseNumberOf(none, [1], 4)).toEqual({
      kind: "numbered",
      span: "whole",
      ordinals: "2",
      text: "2/4",
    })
  })

  it("範囲があれば前・本・後の群ごとに1から数える", () => {
    expect(phaseNumberOf(spannedRange, [0], 7)).toEqual({
      kind: "numbered",
      span: "lead",
      ordinals: "1",
      text: "1/1",
    })
    expect(phaseNumberOf(spannedRange, [2], 7)).toMatchObject({ span: "delegated", text: "2/3" })
    expect(phaseNumberOf(spannedRange, [4], 7)).toMatchObject({ span: "trail", text: "1/3" })
    expect(phaseNumberOf(spannedRange, [6], 7)).toMatchObject({ span: "trail", text: "3/3" })
  })

  it("並列の段は先頭と末尾の番号を「–」でつなぐ", () => {
    expect(phaseNumberOf(none, [1, 2], 4)).toMatchObject({ ordinals: "2–3", text: "2–3/4" })
    expect(phaseNumberOf(range, [1, 2], 4)).toMatchObject({ ordinals: "1–2", text: "1–2/3" })
  })

  it("段の呼び名・いまの位置は群の名を前に付け、範囲が無ければ付けない", () => {
    const at = (current: number, delegatedRange: WorkPlan["delegatedRange"]): LatestWorkPlan => ({
      kind: "planned",
      ...next(SPANNED, current),
      delegatedRange,
    })
    const plan = { ...next(SPANNED, 4), delegatedRange: spannedRange }
    expect(plannedPhaseTitle(plan, { index: 0, name: "架空の計画" })).toBe("前1. 架空の計画")
    expect(plannedPhaseTitle(plan, { index: 2, name: "架空の段C" })).toBe("本2. 架空の段C")
    expect(plannedPhaseTitle(plan, { index: 5, name: "架空の振り返り" })).toBe(
      "後2. 架空の振り返り",
    )
    expect(workPositionText(at(0, spannedRange))).toBe("前 1/1")
    expect(workPositionText(at(2, spannedRange))).toBe("本 2/3")
    expect(workPositionText(at(4, spannedRange))).toBe("後 1/3")
    expect(workPositionText(at(7, spannedRange))).toBe("後 3/3")
    expect(workPositionText(at(2, none))).toBe("3/7")
    expect(workPositionText(at(7, none))).toBe("7/7")
  })

  it("後ろの群が無い範囲で全部済めば、本の段の数で言う", () => {
    const plan: LatestWorkPlan = { kind: "planned", ...next(GROUPED, 3), delegatedRange: range }
    expect(workPositionText(plan)).toBe("本 3/3")
    expect(workPositionText({ ...plan, current: 1 })).toBe("本 1–2/3")
  })

  it("済み具合は範囲の外を含む全部の段で言う（範囲なし・範囲の中だけ済み・全部済み）", () => {
    const at = (current: number, delegatedRange: WorkPlan["delegatedRange"]): WorkPlan => ({
      ...next(GROUPED, current),
      delegatedRange,
    })

    expect(completionText(at(2, none))).toBe("4段のうち3段済み")
    expect(completionText(at(2, range))).toBe("4段のうち3段済み")
    expect(completionText(at(3, range))).toBe("4段すべて済み")
    expect(completionText(at(3, none))).toBe("4段すべて済み")
  })

  it("pending は範囲の前だけを数え、範囲の先頭から後ろは番号を持たない", () => {
    const pending = { kind: "pending", first: 1 } as const
    const at = (current: number): LatestWorkPlan => ({
      kind: "planned",
      ...next(GROUPED, current),
      delegatedRange: pending,
    })
    expect(phaseNumberOf(pending, [0], 4)).toMatchObject({ span: "lead", text: "1/1" })
    expect(phaseNumberOf(pending, [1, 2], 4)).toEqual({ kind: "named" })
    expect(workPositionText(at(0))).toBe("前 1/1")
    expect(workPositionText(at(2))).toBe("")
    expect(workPositionText(at(3))).toBe("")
  })

  it("見出しは群の名と番号と名前で言う", () => {
    const withRange: WorkPlan = { ...next(GROUPED, 0), delegatedRange: range }
    expect(phaseLabel(phaseOf(withRange))).toBe("前 1/1 架空の段A")
    expect(phaseLabel(phaseOf({ ...withRange, current: 1 }))).toBe("本 1–2/3 架空の段B・架空の段C")
    expect(phaseLabel(phaseOf(next(GROUPED, 1)))).toBe("2–3/4 架空の段B・架空の段C")
  })
})

function phaseOf(plan: WorkPlan): Extract<WorkPhase, { readonly kind: "phase" }> {
  const phase = currentPhaseOf({ kind: "planned", ...plan })
  if (phase.kind !== "phase") {
    throw new Error("今の段があるワークプランを渡す")
  }
  return phase
}
