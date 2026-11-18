import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useWorkStripSegmentList } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/hooks/use-work-strip-segment-list.ts"
import {
  useWorkStrip,
  type WorkStripModel,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/hooks/use-work-strip.ts"
import type { SessionEvent } from "../../../../../../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../../../../../../src/shared/session/session-fold.ts"
import { reportEvent } from "../../../../../../../fixture/report-event.ts"
import { checkedTaskId } from "../../../../../../../fixture/task-id.ts"
import {
  foldTimed,
  plan,
  workRequest,
  START,
  stripAt,
} from "../../../../../../../fixture/work-strip.ts"
import { putSession, putState } from "../../../../../../session-store.ts"

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
    expect(resultAfter([workRequest, plan])).toBe("working")
    expect(resultAfter([workRequest, plan, askedPending()])).toBe("awaiting-answer")
  })

  it("ターンが終わってバックグラウンドタスクだけ残るあいだは背景で作業中、答え待ちがあれば答え待ち、背景が無ければ今までどおり", () => {
    const left: SessionEvent = {
      kind: "background-tasks-changed",
      tasks: [{ taskId: checkedTaskId("fake-bg-1"), kind: "shell", description: "架空の待ち" }],
    }
    expect(resultAfter([workRequest, plan, left])).toBe("working")
    expect(resultAfter([workRequest, plan, left, completed])).toBe("background")
    expect(resultAfter([workRequest, plan, left, askedPending(), completed])).toBe(
      "awaiting-answer",
    )
    expect(resultAfter([workRequest, plan, taskOf("finished"), completed])).toBe("done")
  })

  it("閉じたあとは、最後の本文の終わり方で完了・答え待ち・止めたを区別する", () => {
    expect(resultAfter([workRequest, plan, taskOf("finished"), completed])).toBe("done")
    expect(resultAfter([workRequest, plan, taskOf("awaiting-answer"), completed])).toBe(
      "awaiting-answer",
    )
    expect(resultAfter([workRequest, plan, taskOf("stopped"), completed])).toBe("stopped")
  })

  it("レポートに入れ替わったあとで同じやり取りの続きが動き出したら、本文の終わり方ではなく作業中", () => {
    const closed = foldTimed([
      [workRequest, START],
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
            tasks: [
              { taskId: checkedTaskId("fictional-task"), kind: "agent", description: "架空の委譲" },
            ],
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

    expect(resultAfter([workRequest, plan, failed])).toBe("failed")
    expect(resultAfter([workRequest, failed])).toBe("failed")
    expect(
      stripAt(
        foldTimed([
          [workRequest, START],
          [failed, START + 7_000],
        ]),
        START + 8_000,
      ),
    ).toMatchObject({ kind: "finished", sideLabel: "所要 7秒" })
  })

  it("ワークプランの無いまま本文を出して閉じたら、区間の無い完了の帯を残す", () => {
    const strip = stripAt(
      foldTimed([
        [workRequest, START],
        [reportEvent(), START + 1_000],
        [completed, START + 5_000],
      ]),
      START + 6_000,
    )

    expect(strip).toMatchObject({
      kind: "finished",
      result: "done",
      headLabel: "できました",
      sideLabel: "所要 5秒",
    })
  })
})

describe("useWorkStrip（状態の印と見出し）", () => {
  const failed: SessionEvent = {
    kind: "turn-finished",
    outcome: { kind: "failed", cause: { kind: "max-turns" } },
  }

  function headOf(events: readonly SessionEvent[]) {
    const strip = stripAt(
      foldTimed(events.map((event, index) => [event, START + index * 1_000] as const)),
      START + 60_000,
    )
    if (strip.kind === "none") {
      throw new Error("帯が出ていない")
    }
    return { mark: strip.mark, headLabel: strip.headLabel, statement: strip.statement }
  }

  function questionPending(count: number): SessionEvent {
    return {
      kind: "pending-changed",
      pending: [
        {
          kind: "question",
          id: "toolu_question",
          questions: Array.from({ length: count }, (_, index) => ({
            text: `架空の質問${String(index)}`,
            header: `架空${String(index)}`,
            options: [
              { label: "はい", description: "" },
              { label: "いいえ", description: "" },
            ],
            multiSelect: false,
          })),
          briefs: [],
          imageSizes: [],
          unshelvedImages: [],
        },
      ],
    }
  }

  it("作業中は差し色の点と今のフェーズの名前で、一文は空", () => {
    expect(headOf([workRequest, plan])).toEqual({
      mark: "dot",
      headLabel: "架空の段A",
      statement: "",
    })
  })

  it("背景で作業中も、点と今のフェーズの名前", () => {
    const left: SessionEvent = {
      kind: "background-tasks-changed",
      tasks: [{ taskId: checkedTaskId("fake-bg-1"), kind: "shell", description: "架空の待ち" }],
    }
    expect(headOf([workRequest, plan, left, completed])).toEqual({
      mark: "dot",
      headLabel: "架空の段A",
      statement: "",
    })
  })

  it("ワークプランの無いターンの見出しは作業中", () => {
    expect(headOf([workRequest])).toEqual({ mark: "dot", headLabel: "作業中", statement: "" })
  })

  it("答え待ちは「返事を待っています」と質問の件数、許可のお伺いは許可の件数で言う", () => {
    expect(headOf([workRequest, plan, questionPending(2)])).toEqual({
      mark: "dot",
      headLabel: "返事を待っています",
      statement: "質問 2件",
    })
    expect(headOf([workRequest, plan, askedPending()])).toEqual({
      mark: "dot",
      headLabel: "返事を待っています",
      statement: "許可 1件",
    })
  })

  it("止めたは灰の四角と「止めました」、今のフェーズの途中と添える", () => {
    expect(headOf([workRequest, plan, taskOf("stopped"), completed])).toEqual({
      mark: "square",
      headLabel: "止めました",
      statement: "架空の段Aの途中",
    })
  })

  it("失敗は ✕ と「失敗しました」、失敗の表示と同じ理由の語を添える", () => {
    expect(headOf([workRequest, plan, failed])).toEqual({
      mark: "cross",
      headLabel: "失敗しました",
      statement: "往復の上限に当たった",
    })
  })

  it("完了はチェックと「できました」で、一文は無い", () => {
    expect(headOf([workRequest, plan, taskOf("finished"), completed])).toEqual({
      mark: "check",
      headLabel: "できました",
      statement: "",
    })
  })
})

describe("useWorkStrip（今の区間）", () => {
  function spinningOf(strip: WorkStripModel): boolean[] {
    if (strip.kind === "none") {
      return []
    }
    const track = renderHook(() => useWorkStripSegmentList()).result.current
    return track.kind === "shown"
      ? track.segments.flatMap((segment) =>
          segment.phases.map((phase) => phase.state === "current"),
        )
      : []
  }

  it("作業中は今の区間だけが今の段になる", () => {
    const strip = stripAt(
      foldTimed([
        [workRequest, START],
        [plan, START + 1_000],
      ]),
      START + 5_000,
    )

    expect(strip.kind).toBe("working")
    expect(spinningOf(strip)).toEqual([true, false])
  })

  it("済んだ段とまだの段は今の段にならない", () => {
    const strip = stripAt(
      foldTimed([
        [workRequest, START],
        [{ ...plan, phases: ["架空の段A", "架空の段B", "架空の段C"], current: 1 }, START + 1_000],
      ]),
      START + 5_000,
    )

    expect(spinningOf(strip)).toEqual([false, true, false])
  })

  it("答え待ちのあいだは今の区間は答え待ちの印になる", () => {
    const strip = stripAt(
      foldTimed([
        [workRequest, START],
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

  it("背景で作業中のあいだも今の区間だけが今の段になる", () => {
    const strip = stripAt(
      foldTimed([
        [workRequest, START],
        [plan, START + 1_000],
        [
          {
            kind: "background-tasks-changed",
            tasks: [
              { taskId: checkedTaskId("fictional-task"), kind: "shell", description: "架空の待ち" },
            ],
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
    expect(spinningOf(stripAt(foldTimed([[workRequest, START]]), START + 5_000))).toEqual([])
  })

  it("並列のフェーズで今の段が複数なら、今の区間がすべて今の段になる", () => {
    const grouped: SessionEvent = {
      kind: "work-plan",
      delegatedRange: { kind: "none" },
      skippedPhases: [],
      awaitingSummary: { kind: "none" },
      phaseIds: [],
      phases: ["架空の段A", ["架空の段B", "架空の段C"]],
      current: 1,
      finishedInGroup: [],
      phaseSummary: "架空のまとめ。",
    }

    const strip = stripAt(
      foldTimed([
        [workRequest, START],
        [grouped, START + 1_000],
      ]),
      START + 5_000,
    )

    expect(spinningOf(strip)).toEqual([false, true, true])
  })
})
