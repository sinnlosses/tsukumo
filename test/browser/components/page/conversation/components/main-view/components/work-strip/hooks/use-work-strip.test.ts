import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  useWorkStrip,
  type WorkStripModel,
} from "../../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/work-strip/hooks/use-work-strip.ts"
import type { SessionEvent } from "../../../../../../../../../../src/shared/session/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../../../../src/shared/session/session-state.ts"
import { reportEvent } from "../../../../../../../../../fixture/report-event.ts"
import { putSession } from "../../../../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const START = 1_700_000_000_000

const request: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
const plan: SessionEvent = {
  kind: "work-plan",
  phases: ["架空の段A", "架空の段B"],
  current: 0,
  finishedInGroup: [],
  phaseSummary: "",
}

function bashStarted(id: string): SessionEvent {
  return {
    kind: "tool-started",
    toolUseId: id,
    name: "Bash",
    input: { command: "架空のコマンド" },
    parentToolUseId: undefined,
  }
}

function foldTimed(events: readonly (readonly [SessionEvent, number])[]): SessionState {
  return events.reduce(
    (state, [event, at]) => applySessionEvent(state, event, at),
    INITIAL_SESSION_STATE,
  )
}

function stripAt(state: SessionState, now: number): WorkStripModel {
  vi.spyOn(Temporal.Now, "instant").mockReturnValue(Temporal.Instant.fromEpochMilliseconds(now))
  putSession(state)
  return renderHook(() => useWorkStrip()).result.current
}

describe("useWorkStrip（時刻に依るもの）", () => {
  it("走っている手順の要約に、その手順が始まってからの秒を添え、右端は依頼からの経過", () => {
    const state = foldTimed([
      [request, START],
      [plan, START + 1_000],
      [bashStarted("toolu_1"), START + 60_000],
    ])

    const strip = stripAt(state, START + 72_000)

    expect(strip.kind).toBe("working")
    expect(strip.kind === "working" && strip.activity.text).toBe("Bash  架空のコマンド · 12秒")
    expect(strip.kind === "working" && strip.sideLabel).toBe("1/2 · 経過 1分12秒")
  })

  it("答え待ちの秒は、答え待ちが届いた時刻から数える", () => {
    const state = foldTimed([
      [request, START],
      [plan, START + 1_000],
      [bashStarted("toolu_ask"), START + 10_000],
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
        START + 11_000,
      ],
    ])

    const strip = stripAt(state, START + 18_000)

    expect(strip.kind === "working" && strip.activity.text).toBe(
      "お伺いが届いた · 許可: Bash  架空のコマンド · 答え待ち 7秒",
    )
    expect(
      strip.kind === "working" &&
        strip.phases.map((slot) => (slot.kind === "phase" ? slot.phase.state : slot.state)),
    ).toEqual(["asking", "upcoming"])
  })

  it("答え待ちと同じ id の手順が無くても、届いた時刻から秒を添える", () => {
    const state = foldTimed([
      [request, START],
      [plan, START + 1_000],
      [
        {
          kind: "pending-changed",
          pending: [
            {
              kind: "permission",
              id: "toolu_unknown",
              toolName: "Bash",
              input: { command: "架空のコマンド" },
            },
          ],
        },
        START + 11_000,
      ],
    ])

    const strip = stripAt(state, START + 18_000)

    expect(strip.kind === "working" && strip.activity.text).toBe(
      "お伺いが届いた · 許可: Bash  架空のコマンド · 答え待ち 7秒",
    )
  })

  it("ターンが終わってレポートに入れ替わると、右端は終わった時刻で止まった所要", () => {
    const state = foldTimed([
      [request, START],
      [plan, START + 1_000],
      [{ ...plan, current: 2 }, START + 100_000],
      [{ kind: "turn-finished", outcome: { kind: "completed" } }, START + 125_000],
    ])

    const strip = stripAt(state, START + 600_000)

    expect(strip).toMatchObject({
      kind: "finished",
      headLabel: "2段すべて済み",
      sideLabel: "所要 2分05秒",
    })
  })

  it("委譲中に送った脇の話のあいだも、親の段取り・今の段・依頼からの経過を出し続ける", () => {
    const state = foldTimed([
      [request, START],
      [plan, START + 1_000],
      [{ ...plan, current: 1, phaseSummary: "架空のまとめ。" }, START + 2_000],
      [
        {
          kind: "background-tasks-changed",
          tasks: [{ taskId: "fictional-task", kind: "agent", description: "架空の委譲" }],
        },
        START + 3_000,
      ],
      [{ kind: "turn-finished", outcome: { kind: "completed" } }, START + 4_000],
      [{ kind: "aside", text: "架空の問い", images: [] }, START + 60_000],
      [{ kind: "speech", text: "架空の答え", expression: "default" }, START + 61_000],
    ])

    const strip = stripAt(state, START + 72_000)

    expect(strip).toMatchObject({
      kind: "working",
      headLabel: "架空の段B",
      sideLabel: "2/2 · 経過 1分12秒",
    })
    expect(strip.kind === "working" && strip.phases.map((slot) => slot.kind)).toEqual([
      "phase",
      "phase",
    ])
  })
})

describe("useWorkStrip（段のまとまり）", () => {
  const groupedPlan = (current: number, finishedInGroup: readonly string[]): SessionEvent => ({
    kind: "work-plan",
    phases: ["架空の段A", ["架空の段B", "架空の段C"]],
    current,
    finishedInGroup,
    phaseSummary: current > 0 || finishedInGroup.length > 0 ? "架空のまとめ。" : "",
  })

  it("まとまりは中の段の丸を1つにまとめ、今の段が2つなら頭の字と位置をつなぐ", () => {
    const state = foldTimed([
      [request, START],
      [groupedPlan(1, []), START + 1_000],
    ])

    const strip = stripAt(state, START + 5_000)

    expect(strip).toMatchObject({
      kind: "working",
      headLabel: "架空の段B・架空の段C",
      sideLabel: "2·3/3 · 経過 5秒",
    })
    expect(strip.kind === "working" && strip.phases).toMatchObject([
      { kind: "phase", phase: { mark: "✓", state: "done" } },
      {
        kind: "parallel",
        label: "並列 2·3",
        phases: [
          { mark: "2", state: "current" },
          { mark: "3", state: "current" },
        ],
      },
    ])
  })

  it("後ろの段から済ませると、済んだ丸だけが ✓ になり、今の段は残った1つ", () => {
    const state = foldTimed([
      [request, START],
      [groupedPlan(1, []), START + 1_000],
      [groupedPlan(1, ["架空の段C"]), START + 2_000],
    ])

    const strip = stripAt(state, START + 5_000)

    expect(strip).toMatchObject({ headLabel: "架空の段B", sideLabel: "2/3 · 経過 5秒" })
    expect(strip.kind === "working" && strip.phases[1]).toMatchObject({
      phases: [
        { mark: "2", state: "current" },
        { mark: "✓", state: "done" },
      ],
    })
  })

  it("重なって走った段があっても、右端の所要は段の和ではなく依頼の壁時計", () => {
    const state = foldTimed([
      [request, START],
      [groupedPlan(0, []), START + 1_000],
      [groupedPlan(1, []), START + 10_000],
      [groupedPlan(1, ["架空の段C"]), START + 40_000],
      [groupedPlan(2, []), START + 50_000],
      [{ kind: "turn-finished", outcome: { kind: "completed" } }, START + 60_000],
    ])

    expect(stripAt(state, START + 600_000)).toMatchObject({
      kind: "finished",
      headLabel: "3段すべて済み",
      sideLabel: "所要 1分00秒",
    })
  })
})

describe("useWorkStrip（`/clear` の依頼）", () => {
  it("依頼の先頭トークンがちょうど `/clear` なら、2行目は「会話を片付けている」", () => {
    const state = foldTimed([[{ kind: "request", text: "/clear", images: [] }, START]])

    const strip = stripAt(state, START + 5_000)

    expect(strip.kind === "working" && strip.activity.text).toBe("会話を片付けている")
  })

  it("`/clear-foo` のような別名では、2行目は「考えている」のまま", () => {
    const state = foldTimed([[{ kind: "request", text: "/clear-foo", images: [] }, START]])

    const strip = stripAt(state, START + 5_000)

    expect(strip.kind === "working" && strip.activity.text).toBe("考えている")
  })
})

describe("useWorkStrip（段取りが届く前）", () => {
  it("送った直後から、段の丸の無い「作業中」の帯を作業中の状態で出す", () => {
    const state = foldTimed([[request, START]])

    const strip = stripAt(state, START + 12_000)

    expect(strip).toMatchObject({
      kind: "working",
      phases: [],
      result: "working",
      headLabel: "作業中",
      sideLabel: "経過 12秒",
    })
  })

  it("本文が1つも無いまま閉じたら、帯ごと消す", () => {
    const state = foldTimed([
      [request, START],
      [{ kind: "turn-finished", outcome: { kind: "completed" } }, START + 5_000],
    ])

    expect(stripAt(state, START + 6_000)).toEqual({ kind: "none" })
  })
})

function taskOf(outcome: "finished" | "stopped" | "awaiting-answer"): SessionEvent {
  return reportEvent({ task: { kind: "task", id: "fictional-task", name: "架空の作業", outcome } })
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

  it("閉じたあとは、最後の本文の終わり方で完了・答え待ち・止めたを区別する", () => {
    expect(resultAfter([request, plan, taskOf("finished"), completed])).toBe("done")
    expect(resultAfter([request, plan, taskOf("awaiting-answer"), completed])).toBe(
      "awaiting-answer",
    )
    expect(resultAfter([request, plan, taskOf("stopped"), completed])).toBe("stopped")
  })

  it("失敗で終わったら、段取りが無くても帯を残して失敗にする", () => {
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

  it("段取りの無いまま本文を出して閉じたら、段の丸の無い完了の帯を残す", () => {
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
