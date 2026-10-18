import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  useWorkStrip,
  type WorkStripModel,
} from "../../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/work-strip/hooks/use-work-strip.ts"
import type { SessionEvent } from "../../../../../../../../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../../../../../../../../src/shared/session/session-fold.ts"
import { reportEvent } from "../../../../../../../../../fixture/report-event.ts"
import {
  foldTimed,
  plan,
  request,
  START,
  stripAt,
} from "../../../../../../../../../fixture/work-strip.ts"
import { putSession, putState } from "../../../../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function taskOf(outcome: "finished" | "stopped" | "awaiting-answer"): SessionEvent {
  return reportEvent({
    task: { kind: "task", id: "fictional-task", name: "架空の作業", outcome, genre: "work" },
  })
}

const completed: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }

function askedPending(): SessionEvent {
  return {
    kind: "pending-changed",
    pending: [
      { kind: "permission", id: "toolu_ask", toolName: "Bash", input: { command: "架空" } },
    ],
  }
}

function resultAfter(events: readonly SessionEvent[]): string | undefined {
  const strip = stripAt(
    foldTimed(events.map((event, index) => [event, START + index * 1_000] as const)),
    START + 60_000,
  )
  return strip.kind === "none" ? undefined : strip.result
}

describe("useWorkStrip（状態）", () => {
  it("働いているあいだは作業中、答え待ちが届けば答え待ち", () => {
    expect(resultAfter([request, plan])).toBe("working")
    expect(resultAfter([request, plan, askedPending()])).toBe("awaiting-answer")
  })

  it("ターンが終わってバックグラウンドタスクだけ残るあいだは背景で作業中、答え待ちがあれば答え待ち、背景が無ければ今までどおり", () => {
    const left: SessionEvent = {
      kind: "background-tasks-changed",
      tasks: [{ taskId: "fake-bg-1", kind: "shell", description: "架空の待ち" }],
    }
    expect(resultAfter([request, plan, left])).toBe("working")
    expect(resultAfter([request, plan, left, completed])).toBe("background")
    expect(resultAfter([request, plan, left, askedPending(), completed])).toBe("awaiting-answer")
    expect(resultAfter([request, plan, taskOf("finished"), completed])).toBe("done")
  })

  it("閉じたあとは、最後の本文の終わり方で完了・答え待ち・止めたを区別する", () => {
    expect(resultAfter([request, plan, taskOf("finished"), completed])).toBe("done")
    expect(resultAfter([request, plan, taskOf("awaiting-answer"), completed])).toBe(
      "awaiting-answer",
    )
    expect(resultAfter([request, plan, taskOf("stopped"), completed])).toBe("stopped")
  })

  it("レポートに入れ替わったあとで同じやり取りの続きが動き出したら、本文の終わり方ではなく作業中", () => {
    const closed = foldTimed([
      [request, START],
      [plan, START + 1_000],
      [reportEvent(), START + 2_000],
      [completed, START + 3_000],
    ])
    putSession(closed)
    act(() => {
      putState(
        applySessionEvent(
          closed,
          {
            kind: "background-tasks-changed",
            tasks: [{ taskId: "fictional-task", kind: "agent", description: "架空の委譲" }],
          },
          START + 5_000,
        ),
      )
    })

    expect(renderHook(() => useWorkStrip()).result.current).toMatchObject({
      kind: "finished",
      result: "working",
    })
  })

  it("失敗で終わったら、ワークプランが無くても帯を残して失敗にする", () => {
    const failed: SessionEvent = {
      kind: "turn-finished",
      outcome: { kind: "failed", cause: { kind: "max-turns" } },
    }

    expect(resultAfter([request, plan, failed])).toBe("failed")
    expect(resultAfter([request, failed])).toBe("failed")
    expect(
      stripAt(
        foldTimed([
          [request, START],
          [failed, START + 7_000],
        ]),
        START + 8_000,
      ),
    ).toMatchObject({ kind: "finished", sideLabel: "所要 7秒" })
  })

  it("ワークプランの無いまま本文を出して閉じたら、段の丸の無い完了の帯を残す", () => {
    const strip = stripAt(
      foldTimed([
        [request, START],
        [reportEvent(), START + 1_000],
        [completed, START + 5_000],
      ]),
      START + 6_000,
    )

    expect(strip).toMatchObject({
      kind: "finished",
      result: "done",
      phases: [],
      headLabel: "",
      sideLabel: "所要 5秒",
    })
  })
})

describe("useWorkStrip（回る弧）", () => {
  function spinningOf(strip: WorkStripModel): boolean[] {
    return strip.kind === "none"
      ? []
      : strip.phases.flatMap((slot) =>
          slot.kind === "phase"
            ? [slot.phase.spinning]
            : slot.phases.map((phase) => phase.spinning),
        )
  }

  it("作業中は今の段の丸だけが回る", () => {
    const strip = stripAt(
      foldTimed([
        [request, START],
        [plan, START + 1_000],
      ]),
      START + 5_000,
    )

    expect(strip.kind).toBe("working")
    expect(spinningOf(strip)).toEqual([true, false])
  })

  it("済んだ段とまだの段は回らない", () => {
    const strip = stripAt(
      foldTimed([
        [request, START],
        [{ ...plan, phases: ["架空の段A", "架空の段B", "架空の段C"], current: 1 }, START + 1_000],
      ]),
      START + 5_000,
    )

    expect(spinningOf(strip)).toEqual([false, true, false])
  })

  it("答え待ちのあいだは今の段の丸も回らない", () => {
    const strip = stripAt(
      foldTimed([
        [request, START],
        [plan, START + 1_000],
        [
          {
            kind: "pending-changed",
            pending: [
              {
                kind: "permission",
                id: "toolu_ask",
                toolName: "Bash",
                input: { command: "架空のコマンド" },
              },
            ],
          },
          START + 2_000,
        ],
      ]),
      START + 5_000,
    )

    expect(spinningOf(strip)).toEqual([false, false])
  })

  it("レポートに入れ替わった済んだ姿では回らない", () => {
    const strip = stripAt(
      foldTimed([
        [request, START],
        [plan, START + 1_000],
        [reportEvent(), START + 2_000],
        [completed, START + 3_000],
      ]),
      START + 5_000,
    )

    expect(strip.kind).toBe("finished")
    expect(spinningOf(strip)).toEqual([false, false])
  })

  it("背景で作業中のあいだも今の段の丸だけが回る", () => {
    const strip = stripAt(
      foldTimed([
        [request, START],
        [plan, START + 1_000],
        [
          {
            kind: "background-tasks-changed",
            tasks: [{ taskId: "fictional-task", kind: "shell", description: "架空の待ち" }],
          },
          START + 2_000,
        ],
        [completed, START + 3_000],
      ]),
      START + 5_000,
    )

    expect(strip).toMatchObject({ kind: "working", result: "background" })
    expect(spinningOf(strip)).toEqual([true, false])
  })

  it("ワークプランが届く前は丸が無い", () => {
    expect(spinningOf(stripAt(foldTimed([[request, START]]), START + 5_000))).toEqual([])
  })

  it("並列の段で今の段が複数なら、今の段の丸がすべて回る", () => {
    const grouped: SessionEvent = {
      kind: "work-plan",
      delegatedRange: { kind: "none" },
      skippedPhases: [],
      awaitingSummary: { kind: "none" },
      phases: ["架空の段A", ["架空の段B", "架空の段C"]],
      current: 1,
      finishedInGroup: [],
      phaseSummary: "架空のまとめ。",
    }

    const strip = stripAt(
      foldTimed([
        [request, START],
        [grouped, START + 1_000],
      ]),
      START + 5_000,
    )

    expect(spinningOf(strip)).toEqual([false, true, true])
  })
})
