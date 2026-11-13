import { describe, expect, it } from "vitest"

import { remainingLinesOf } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/failed-paper.ts"
import type { WorkPlanRow } from "../../../../../../../../src/browser/components/page/conversation/domain/work-plan-row.ts"
import type { TurnStep } from "../../../../../../../../src/shared/session/turn-step.ts"

function row(key: string, state: WorkPlanRow["state"], touched: readonly string[]): WorkPlanRow {
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
    touched,
    live: { kind: "none" },
    usual: { kind: "none" },
    ask: { kind: "none" },
  }
}

function toolStep(id: string, status: TurnStep["status"]): TurnStep {
  return {
    toolUseId: id,
    name: "Bash",
    input: { command: "架空のコマンド" },
    nested: false,
    startedAt: { kind: "restored" },
    status,
    backgroundEnd: { kind: "foreground" },
    phase: { kind: "none" },
  }
}

const DONE = { kind: "done", finishedAt: { kind: "restored" } } as const
const FAILED = {
  kind: "failed",
  output: { head: "架空の出力", omittedLength: 0 },
  finishedAt: { kind: "restored" },
} as const

describe("remainingLinesOf", () => {
  it("済んだ段と止まった段で触ったファイルは重ねて数えない", () => {
    const lines = remainingLinesOf({
      rows: [
        row("1", "done", ["a.ts", "b.ts"]),
        row("2", "done", ["b.ts", "c.ts"]),
        row("3", "failed", ["c.ts", "d.ts"]),
        row("4", "upcoming", ["z.ts"]),
      ],
      steps: [],
    })

    expect(lines).toEqual(["済んだ 2 段の変更 4 ファイル"])
  })

  it("落ちた手順と通った手順の件数を出し、落ちた手順の先頭1件を言う", () => {
    const lines = remainingLinesOf({
      rows: [],
      steps: [toolStep("1", DONE), toolStep("2", FAILED), toolStep("3", FAILED)],
    })

    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^落ちた手順 2 件（.+）$/u)
    expect(lines[1]).toBe("通った手順 1 件")
  })

  it("失敗した手順も触ったファイルも無ければ行を出さない", () => {
    expect(remainingLinesOf({ rows: [row("1", "failed", [])], steps: [] })).toEqual([])
  })
})
