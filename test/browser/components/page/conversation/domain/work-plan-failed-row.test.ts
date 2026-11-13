import { describe, expect, it } from "vitest"

import { markFailedRow } from "../../../../../../src/browser/components/page/conversation/domain/work-plan-failed-row.ts"
import {
  rowsOfSlot,
  type WorkPlanRow,
  type WorkPlanSlot,
} from "../../../../../../src/browser/components/page/conversation/domain/work-plan-row.ts"

function row(key: string, state: WorkPlanRow["state"]): WorkPlanRow {
  return {
    key,
    state,
    ordinal: key,
    title: `架空の段${key}`,
    duration: { kind: "unknown" },
    summary: "",
    lap: 1,
    laps: [],
    delegates: [],
    touched: [],
    live: { kind: "none" },
    usual: { kind: "none" },
    ask: { kind: "none" },
  }
}

function phase(item: WorkPlanRow): WorkPlanSlot {
  return { kind: "phase", spanHead: { kind: "none" }, row: item }
}

function statesOf(slots: readonly WorkPlanSlot[]): readonly string[] {
  return slots.flatMap(rowsOfSlot).map((item) => item.state)
}

describe("markFailedRow", () => {
  it("読み順で最初の今の段だけを failed にする", () => {
    const slots = [phase(row("1", "done")), phase(row("2", "current")), phase(row("3", "upcoming"))]

    expect(statesOf(markFailedRow(slots))).toEqual(["done", "failed", "upcoming"])
  })

  it("並列の段の中の今の段も、最初の1つだけを failed にする", () => {
    const slots: readonly WorkPlanSlot[] = [
      phase(row("1", "done")),
      {
        kind: "parallel",
        spanHead: { kind: "none" },
        key: "p",
        label: "並列",
        rows: [row("2", "current"), row("3", "current")],
      },
    ]

    expect(statesOf(markFailedRow(slots))).toEqual(["done", "failed", "current"])
  })

  it("今の段が無ければ並びをそのまま返す", () => {
    const slots = [phase(row("1", "done")), phase(row("2", "upcoming"))]

    expect(markFailedRow(slots)).toBe(slots)
  })
})
