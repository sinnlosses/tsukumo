import { describe, expect, it } from "bun:test"

import {
  INITIAL_VISIT_TALLY,
  isWaiting,
  nextVisitLine,
  tallyVisit,
  VISIT_TIMING,
  type VisitTally,
  visitArrival,
  visitDeparture,
} from "../../../src/server/core/visit-timing.ts"
import { type VisitScript } from "../../../src/shared/character-visit.ts"
import { type SessionEvent } from "../../../src/shared/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../src/shared/session-state.ts"
import { type VisitEndReason } from "../../../src/shared/visit.ts"

// 依頼・セリフ・台本はすべて手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。
const SCRIPT: VisitScript = [
  { speaker: "guest", expression: "curious", text: "架空の客の一言目" },
  { speaker: "host", expression: "proud", text: "架空のあるじの返事" },
]

const REQUEST: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
const TOOL_STARTED: SessionEvent = {
  kind: "tool-started",
  toolUseId: "fictional-tool-1",
  name: "Bash",
  input: { command: "fictional-long-command" },
  parentToolUseId: undefined,
}
const TOOL_FINISHED: SessionEvent = {
  kind: "tool-finished",
  toolUseId: "fictional-tool-1",
  content: "架空の結果",
  isError: false,
}
const BACKGROUND_STARTED: SessionEvent = {
  kind: "background-tasks-changed",
  tasks: [{ taskId: "fictional-bg-1", kind: "shell", description: "架空の待ち" }],
}
const TURN_FINISHED: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }
const VISIT_STARTED: SessionEvent = {
  kind: "visit-started",
  guest: "fictional-guest",
  script: SCRIPT,
  farewell: "架空の帰りの一言",
}
const PENDING: SessionEvent = {
  kind: "pending-changed",
  pending: [
    {
      kind: "permission",
      id: "fictional-ask-1",
      toolName: "Bash",
      input: { command: "fictional-command" },
    },
  ],
}

/** 初期の姿にイベントを順に畳む（時刻は並べた順に 1 ずつ進める）。 */
function stateAfter(...events: readonly SessionEvent[]): SessionState {
  return events.reduce(
    (state, event, index) => applySessionEvent(state, event, index),
    INITIAL_SESSION_STATE,
  )
}

/** 信号 B（トップレベルのツールが走りっぱなし）。 */
const TOOL_WAITING = stateAfter(REQUEST, TOOL_STARTED)
/** 信号 A（ターンが終わっていて、背景のタスクだけが動いている）。 */
const BACKGROUND_WAITING = stateAfter(REQUEST, BACKGROUND_STARTED, TURN_FINISHED)

/** `at` から待ち始めた勘定。 */
function waitingSince(at: number): VisitTally {
  return tallyVisit(INITIAL_VISIT_TALLY, TOOL_WAITING, TOOL_STARTED, at)
}

describe("isWaiting", () => {
  it("信号 A: ターンが終わっていて背景のタスクが動いている", () => {
    expect(isWaiting(BACKGROUND_WAITING)).toBe(true)
    expect(isWaiting(stateAfter(REQUEST, TURN_FINISHED))).toBe(false)
  })

  it("信号 B: トップレベルのツールに結果がまだ来ていない", () => {
    expect(isWaiting(TOOL_WAITING)).toBe(true)
    expect(isWaiting(stateAfter(REQUEST, TOOL_STARTED, TOOL_FINISHED))).toBe(false)
  })

  it("入れ子のツール（サブエージェントの中）だけが走っているのは待ちに数えない", () => {
    const nested = stateAfter(REQUEST, { ...TOOL_STARTED, parentToolUseId: "fictional-parent" })

    expect(isWaiting(nested)).toBe(false)
  })

  it("前のやり取りで結果の来なかったツールは、いまの待ちに数えない", () => {
    const stale = stateAfter(
      REQUEST,
      TOOL_STARTED,
      { kind: "turn-finished", outcome: { kind: "interrupted" } },
      REQUEST,
    )

    expect(isWaiting(stale)).toBe(false)
  })

  it("答え待ちと雑談モードでは待ちに数えない", () => {
    expect(isWaiting(applySessionEvent(TOOL_WAITING, PENDING, 10))).toBe(false)
    expect(
      isWaiting(
        applySessionEvent(BACKGROUND_WAITING, { kind: "chat-mode-changed", chat: true }, 10),
      ),
    ).toBe(false)
  })
})

describe("visitArrival", () => {
  it("信号 B が続けて待ちのしきい値に届いたら来る。手前ならその時刻まで待つ", () => {
    const tally = waitingSince(1_000)

    expect(
      visitArrival(tally, TOOL_WAITING, 1_000 + VISIT_TIMING.waitMs - 1, VISIT_TIMING),
    ).toEqual({ kind: "later", at: 1_000 + VISIT_TIMING.waitMs })
    expect(visitArrival(tally, TOOL_WAITING, 1_000 + VISIT_TIMING.waitMs, VISIT_TIMING)).toEqual({
      kind: "arrive",
    })
  })

  it("信号 A でも同じしきい値で来る", () => {
    const tally = tallyVisit(INITIAL_VISIT_TALLY, BACKGROUND_WAITING, TURN_FINISHED, 2_000)

    expect(
      visitArrival(tally, BACKGROUND_WAITING, 2_000 + VISIT_TIMING.waitMs, VISIT_TIMING),
    ).toEqual({ kind: "arrive" })
  })

  it("待っていなければ来ない", () => {
    const idle = stateAfter(REQUEST, TURN_FINISHED)
    const tally = tallyVisit(INITIAL_VISIT_TALLY, idle, TURN_FINISHED, 0)

    expect(visitArrival(tally, idle, VISIT_TIMING.waitMs * 10, VISIT_TIMING)).toEqual({
      kind: "never",
    })
  })

  it("待ちが途切れると数え直す（続けてしきい値に届いていなければ来ない）", () => {
    const finished = stateAfter(REQUEST, TOOL_STARTED, TOOL_FINISHED)
    const broken = tallyVisit(waitingSince(0), finished, TOOL_FINISHED, 60_000)
    const again = tallyVisit(broken, TOOL_WAITING, TOOL_STARTED, 70_000)

    expect(visitArrival(again, TOOL_WAITING, VISIT_TIMING.waitMs, VISIT_TIMING)).toEqual({
      kind: "later",
      at: 70_000 + VISIT_TIMING.waitMs,
    })
  })

  it("答え待ちのあいだは来ず、答えたあとは答えた時刻から数え直す", () => {
    const asking = applySessionEvent(TOOL_WAITING, PENDING, 30_000)
    const whileAsking = tallyVisit(waitingSince(0), asking, PENDING, 30_000)
    const answered = applySessionEvent(asking, { kind: "pending-changed", pending: [] }, 200_000)
    const afterAnswer = tallyVisit(
      whileAsking,
      answered,
      { kind: "pending-changed", pending: [] },
      200_000,
    )

    expect(visitArrival(whileAsking, asking, 200_000, VISIT_TIMING)).toEqual({ kind: "never" })
    expect(visitArrival(afterAnswer, answered, 200_000, VISIT_TIMING)).toEqual({
      kind: "later",
      at: 200_000 + VISIT_TIMING.waitMs,
    })
  })

  it("雑談モードでは来ない", () => {
    const chat = applySessionEvent(TOOL_WAITING, { kind: "chat-mode-changed", chat: true }, 0)
    const tally = tallyVisit(INITIAL_VISIT_TALLY, chat, TOOL_STARTED, 0)

    expect(visitArrival(tally, chat, VISIT_TIMING.waitMs * 10, VISIT_TIMING)).toEqual({
      kind: "never",
    })
  })

  it("1回の待ちに1度だけ来る（帰ったあとも同じ待ちが続くあいだは来ない）", () => {
    const visiting = applySessionEvent(TOOL_WAITING, VISIT_STARTED, VISIT_TIMING.waitMs)
    const arrived = tallyVisit(waitingSince(0), visiting, VISIT_STARTED, VISIT_TIMING.waitMs)
    const ended: SessionEvent = { kind: "visit-ended", reason: "script-finished" }
    const left = applySessionEvent(visiting, ended, VISIT_TIMING.waitMs + 10_000)
    const afterLeft = tallyVisit(arrived, left, ended, VISIT_TIMING.waitMs + 10_000)

    expect(visitArrival(arrived, visiting, VISIT_TIMING.waitMs * 2, VISIT_TIMING)).toEqual({
      kind: "never",
    })
    expect(visitArrival(afterLeft, left, VISIT_TIMING.cooldownMs * 2, VISIT_TIMING)).toEqual({
      kind: "never",
    })
  })

  it("前の訪問から間が空くまでは、次の待ちでも来ない", () => {
    const ended: SessionEvent = { kind: "visit-ended", reason: "wait-over" }
    const idle = stateAfter(REQUEST, TURN_FINISHED)
    const left = tallyVisit(INITIAL_VISIT_TALLY, idle, ended, 100_000)
    const nextWait = tallyVisit(left, TOOL_WAITING, TOOL_STARTED, 110_000)

    expect(
      visitArrival(nextWait, TOOL_WAITING, 110_000 + VISIT_TIMING.waitMs, VISIT_TIMING),
    ).toEqual({ kind: "later", at: 100_000 + VISIT_TIMING.cooldownMs })
    expect(
      visitArrival(nextWait, TOOL_WAITING, 100_000 + VISIT_TIMING.cooldownMs, VISIT_TIMING),
    ).toEqual({ kind: "arrive" })
  })
})

describe("visitDeparture", () => {
  const visiting = applySessionEvent(TOOL_WAITING, VISIT_STARTED, 0)

  it("訪問中でなければ何が来ても帰らない", () => {
    const request = applySessionEvent(TOOL_WAITING, REQUEST, 0)

    expect(visitDeparture(request, REQUEST)).toEqual({ kind: "stay" })
  })

  it("待ちが続いているあいだのほかの出来事では帰らない", () => {
    const nested: SessionEvent = {
      ...TOOL_STARTED,
      toolUseId: "fictional-nested",
      parentToolUseId: "fictional-tool-1",
    }

    expect(visitDeparture(applySessionEvent(visiting, nested, 1), nested)).toEqual({
      kind: "stay",
    })
  })

  it.each([
    ["request", REQUEST],
    ["pending", PENDING],
    ["speech", { kind: "speech", text: "架空のセリフ", expression: "proud" }],
    ["session-ended", { kind: "session-ended", reason: "架空の理由" }],
    ["wait-over", TOOL_FINISHED],
  ] satisfies readonly (readonly [VisitEndReason, SessionEvent])[])(
    "帰る合図 %s で帰る",
    (reason, event) => {
      expect(visitDeparture(applySessionEvent(visiting, event, 1), event)).toEqual({
        kind: "leave",
        reason,
      })
    },
  )

  it("信号 A の背景のタスクが終わった・続きのターンが始まったら帰る", () => {
    const background = applySessionEvent(BACKGROUND_WAITING, VISIT_STARTED, 0)
    const done: SessionEvent = { kind: "background-tasks-changed", tasks: [] }
    const resumed: SessionEvent = { kind: "turn-resumed" }

    expect(visitDeparture(applySessionEvent(background, done, 1), done)).toEqual({
      kind: "leave",
      reason: "wait-over",
    })
    expect(visitDeparture(applySessionEvent(background, resumed, 1), resumed)).toEqual({
      kind: "leave",
      reason: "wait-over",
    })
  })
})

describe("nextVisitLine", () => {
  it("次の行があれば進め、最後の行のあとは台本の終わり", () => {
    const visiting = applySessionEvent(TOOL_WAITING, VISIT_STARTED, 0).visit
    if (visiting.kind !== "visiting") {
      throw new Error("訪問中になっていない")
    }

    expect(nextVisitLine(visiting)).toEqual({ kind: "line", line: 1 })
    expect(nextVisitLine({ ...visiting, line: 1 })).toEqual({ kind: "finished" })
  })
})
