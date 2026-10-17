import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  useWorkStrip,
  type WorkStripModel,
  type WorkStripPhase,
  type WorkStripPhasePopover,
} from "../../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/work-strip/hooks/use-work-strip.ts"
import { useMainViewContent } from "../../../../../../../../../../src/browser/stores/main-view-content.ts"
import type { SessionEvent } from "../../../../../../../../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../../../../../../../../src/shared/session/session-fold.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../../../../src/shared/session/session-state.ts"
import { reportEvent } from "../../../../../../../../../fixture/report-event.ts"
import { putSession, putState } from "../../../../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const START = 1_700_000_000_000

const request: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
const plan: SessionEvent = {
  kind: "work-plan",
  delegatedRange: { kind: "none" },
  skippedPhases: [],
  awaitingSummary: { kind: "none" },
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
    expect(strip.kind === "working" && strip.sideLabel).toBe("経過 1分12秒")
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

  it("範囲が pending のあいだは、前の段だけを数え、範囲の先頭の丸を「…」・その後ろを「・」にする", () => {
    const pending: SessionEvent = {
      ...plan,
      delegatedRange: { kind: "pending", first: 1 },
      phases: ["架空の計画", "架空の段", "架空の受け入れ"],
    }
    const strip = stripAt(
      foldTimed([
        [request, START],
        [pending, START + 1_000],
      ]),
      START + 5_000,
    )

    expect(strip).toMatchObject({
      kind: "working",
      headLabel: "架空の計画",
      positionLabel: "前 1/1",
      sideLabel: "経過 5秒",
    })
    expect(
      strip.kind === "working" &&
        strip.phases.map((slot) => slot.kind === "phase" && slot.phase.mark),
    ).toEqual(["1", "…", "・"])
  })

  it("範囲があれば、群の先頭の丸に群の名を付け、今の群の名を目立たせ、右端に群の中の位置を出す", () => {
    const ranged: SessionEvent = {
      ...plan,
      delegatedRange: { kind: "range", first: 1, count: 2 },
      phases: ["架空の計画", "架空の段A", "架空の段B", "架空の受け入れ", "架空の送り出し"],
      current: 3,
      phaseSummary: "架空のまとめ。",
    }
    const strip = stripAt(
      foldTimed([
        [request, START],
        [ranged, START + 1_000],
      ]),
      START + 5_000,
    )

    expect(strip).toMatchObject({ kind: "working", positionLabel: "後 1/2" })
    expect(strip.kind === "working" && strip.phases.map((slot) => slot.spanHead)).toEqual([
      { kind: "head", name: "前", current: false },
      { kind: "head", name: "本", current: false },
      { kind: "none" },
      { kind: "head", name: "後", current: true },
      { kind: "none" },
    ])
    expect(
      strip.kind === "working" &&
        strip.phases.map((slot) => slot.kind === "phase" && slot.phase.mark),
    ).toEqual(["✓", "✓", "✓", "1", "2"])
  })

  it("範囲の中が全部済んで外の段が残ったまま閉じたら、結果の見出しは全部の段で数える", () => {
    const ranged: SessionEvent = {
      ...plan,
      delegatedRange: { kind: "range", first: 1, count: 2 },
      phases: ["架空の計画", "架空の段A", "架空の段B", "架空の受け入れ"],
    }
    const closed = (current: number) =>
      stripAt(
        foldTimed([
          [request, START],
          [{ ...ranged, current }, START + 1_000],
          [{ kind: "turn-finished", outcome: { kind: "completed" } }, START + 5_000],
        ]),
        START + 6_000,
      )

    expect(closed(3)).toMatchObject({ kind: "finished", headLabel: "4段のうち3段済み" })
    expect(closed(4)).toMatchObject({ kind: "finished", headLabel: "4段すべて済み" })
  })

  it("閉じたあとの続きのターンが走っているあいだは、済み具合でなく今の段の名前を出す", () => {
    vi.spyOn(Temporal.Now, "instant").mockReturnValue(
      Temporal.Instant.fromEpochMilliseconds(START + 7_000),
    )
    putSession(
      foldTimed([
        [request, START],
        [{ ...plan, current: 1 }, START + 1_000],
        [{ kind: "turn-finished", outcome: { kind: "completed" } }, START + 5_000],
        [{ kind: "turn-resumed" }, START + 6_000],
      ]),
    )
    act(() => {
      useMainViewContent.setState({ content: { kind: "report", exchange: 1, arrived: true } })
    })
    const strip = renderHook(() => useWorkStrip()).result.current

    expect(strip).toMatchObject({ kind: "finished", result: "working", headLabel: "架空の段B" })
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
      sideLabel: "経過 1分12秒",
    })
    expect(strip.kind === "working" && strip.phases.map((slot) => slot.kind)).toEqual([
      "phase",
      "phase",
    ])
  })
})

describe("useWorkStrip（並列の段）", () => {
  const groupedPlan = (current: number, finishedInGroup: readonly string[]): SessionEvent => ({
    kind: "work-plan",
    delegatedRange: { kind: "none" },
    skippedPhases: [],
    awaitingSummary: { kind: "none" },
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
      sideLabel: "経過 5秒",
    })
    expect(strip.kind === "working" && strip.phases).toMatchObject([
      { kind: "phase", phase: { mark: "✓", state: "done" } },
      {
        kind: "parallel",
        label: "並列 2–3",
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

    expect(strip).toMatchObject({ headLabel: "架空の段B", sideLabel: "経過 5秒" })
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
  it("送った直後から、段の丸も見出しの字も無い帯を作業中の状態で出す", () => {
    const state = foldTimed([[request, START]])

    const strip = stripAt(state, START + 12_000)

    expect(strip).toMatchObject({
      kind: "working",
      phases: [],
      result: "working",
      headLabel: "",
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

  it("段取りが届く前は丸が無い", () => {
    expect(spinningOf(stripAt(foldTimed([[request, START]]), START + 5_000))).toEqual([])
  })

  it("まとまりで今の段が複数なら、今の段の丸がすべて回る", () => {
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

describe("useWorkStrip（段の吹き出し）", () => {
  const FOUR = ["架空の段A", "架空の段B", "架空の段C", "架空の段D"]

  function workPlan(
    phases: Extract<SessionEvent, { readonly kind: "work-plan" }>["phases"],
    current: number,
    phaseSummary: string,
  ): SessionEvent {
    return {
      kind: "work-plan",
      delegatedRange: { kind: "none" },
      skippedPhases: [],
      awaitingSummary: { kind: "none" },
      phases,
      current,
      finishedInGroup: [],
      phaseSummary,
    }
  }

  function fourPlan(current: number, phaseSummary: string): SessionEvent {
    return workPlan(FOUR, current, phaseSummary)
  }

  /** 段A を 1分40秒で済ませてまとめを渡し、段B をまとめ無しで済ませ、段C が 1分56秒 走っている。 */
  const progressed = foldTimed([
    [request, START],
    [fourPlan(0, ""), START + 1_000],
    [fourPlan(1, "架空の段Aのまとめ。"), START + 101_000],
    [fourPlan(2, ""), START + 130_000],
  ])
  const NOW = START + 246_000

  function phasesOf(strip: WorkStripModel): readonly WorkStripPhase[] {
    return strip.kind === "none"
      ? []
      : strip.phases.flatMap((slot) => (slot.kind === "phase" ? [slot.phase] : slot.phases))
  }

  /** 帯を描き、`index` 番目の丸を押したあとの帯。 */
  function openedAt(state: SessionState, index: number): WorkStripModel {
    vi.spyOn(Temporal.Now, "instant").mockReturnValue(Temporal.Instant.fromEpochMilliseconds(NOW))
    putSession(state)
    const { result } = renderHook(() => useWorkStrip())
    act(() => {
      phasesOf(result.current)[index]?.onToggle()
    })
    return result.current
  }

  function popoverAt(strip: WorkStripModel, index: number): WorkStripPhasePopover | undefined {
    return phasesOf(strip)[index]?.popover
  }

  it("押す前はどの丸の吹き出しも閉じている", () => {
    expect(phasesOf(stripAt(progressed, NOW)).map((phase) => phase.popover.kind)).toEqual([
      "closed",
      "closed",
      "closed",
      "closed",
    ])
  })

  it("済んだ段は「✓ 名前」・所要・段のまとめ・手順への口", () => {
    expect(popoverAt(openedAt(progressed, 0), 0)).toMatchObject({
      kind: "open",
      title: "✓ 架空の段A",
      meta: "済み · 所要 1分40秒",
      summary: "架空の段Aのまとめ。",
      toSteps: { kind: "shown" },
    })
  })

  it("まとめを渡さずに済んだ段は、まとめが空", () => {
    expect(popoverAt(openedAt(progressed, 1), 1)).toMatchObject({
      meta: "済み · 所要 29秒",
      summary: "",
    })
  })

  it("今の段は「番号. 名前」とこの段の経過だけで、まとめも手順への口も無い", () => {
    expect(popoverAt(openedAt(progressed, 2), 2)).toMatchObject({
      title: "3. 架空の段C",
      meta: "いま · この段 1分56秒",
      summary: "",
      toSteps: { kind: "none" },
    })
  })

  it("まだの段は名前と「これから」だけ", () => {
    expect(popoverAt(openedAt(progressed, 3), 3)).toMatchObject({
      title: "4. 架空の段D",
      meta: "これから",
      summary: "",
      toSteps: { kind: "none" },
    })
  })

  it("答え待ちの今の段は、状態の行を「答え待ち」にする", () => {
    const asking = applySessionEvent(
      progressed,
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
      START + 200_000,
    )

    expect(popoverAt(openedAt(asking, 2), 2)).toMatchObject({
      title: "3. 架空の段C",
      meta: "答え待ち · この段 1分56秒",
    })
  })

  it("記録が途中から始まって所要が引けない済んだ段は「所要 不明」", () => {
    const midway = foldTimed([
      [request, START],
      [fourPlan(1, "架空のまとめ。"), START + 1_000],
    ])

    expect(popoverAt(openedAt(midway, 0), 0)).toMatchObject({ meta: "済み · 所要 不明" })
  })

  it("まとまりの中の丸も押せて、同じ形の吹き出しが出る", () => {
    const grouped = foldTimed([
      [request, START],
      [workPlan(["架空の段A", ["架空の段B", "架空の段C"]], 0, ""), START + 1_000],
      [
        workPlan(["架空の段A", ["架空の段B", "架空の段C"]], 1, "架空の段Aのまとめ。"),
        START + 11_000,
      ],
    ])

    expect(popoverAt(openedAt(grouped, 2), 2)).toMatchObject({
      title: "3. 架空の段C",
      meta: "いま · この段 3分55秒",
    })
  })

  it("開くのは押した丸だけで、同じ丸をもう一度押すと閉じ、別の丸を押すと開き替わる", () => {
    vi.spyOn(Temporal.Now, "instant").mockReturnValue(Temporal.Instant.fromEpochMilliseconds(NOW))
    putSession(progressed)
    const { result } = renderHook(() => useWorkStrip())
    const kinds = () => phasesOf(result.current).map((phase) => phase.popover.kind)

    act(() => phasesOf(result.current)[0]?.onToggle())
    expect(kinds()).toEqual(["open", "closed", "closed", "closed"])

    act(() => phasesOf(result.current)[3]?.onToggle())
    expect(kinds()).toEqual(["closed", "closed", "closed", "open"])

    act(() => phasesOf(result.current)[3]?.onToggle())
    expect(kinds()).toEqual(["closed", "closed", "closed", "closed"])
  })

  it("手順への口を押すと吹き出しが閉じる", () => {
    vi.spyOn(Temporal.Now, "instant").mockReturnValue(Temporal.Instant.fromEpochMilliseconds(NOW))
    putSession(progressed)
    const { result } = renderHook(() => useWorkStrip())
    act(() => phasesOf(result.current)[0]?.onToggle())

    const opened = popoverAt(result.current, 0)
    act(() => {
      if (opened?.kind === "open" && opened.toSteps.kind === "shown") {
        opened.toSteps.onGo()
      }
    })

    expect(popoverAt(result.current, 0)?.kind).toBe("closed")
  })

  it("やり取りが替わると閉じる", () => {
    vi.spyOn(Temporal.Now, "instant").mockReturnValue(Temporal.Instant.fromEpochMilliseconds(NOW))
    putSession(progressed)
    const { result } = renderHook(() => useWorkStrip())
    act(() => phasesOf(result.current)[0]?.onToggle())

    act(() => {
      putState(
        [request, fourPlan(1, "架空のまとめ。")].reduce(
          (state, event) => applySessionEvent(state, event, START + 240_000),
          progressed,
        ),
      )
    })

    expect(phasesOf(result.current).map((phase) => phase.popover.kind)).toEqual([
      "closed",
      "closed",
      "closed",
      "closed",
    ])
  })
})
