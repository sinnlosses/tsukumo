import { describe, expect, it } from "vitest"

import {
  createExperienceMetricRecorder,
  type ExperienceMetricEntry,
} from "../../../../src/server/experience-metric/core/experience-metric.ts"
import type { PendingAsk } from "../../../../src/shared/session-driver/pending-ask.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../src/shared/session/session-state.ts"

/** 依頼の文面に入れる目印。記録の行に出てはいけない。 */
const REQUEST_MARK = "架空の依頼の目印・青い傘"

const SESSION_INFO: SessionEvent = {
  kind: "session-info",
  sessionId: "claude-session-1",
  model: undefined,
  permissionMode: undefined,
  slashCommands: [],
  terminalSlashCommands: [],
}

const REQUEST: SessionEvent = { kind: "request", text: REQUEST_MARK, images: [] }
const COMPLETED: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }
const FAILED: SessionEvent = {
  kind: "turn-finished",
  outcome: { kind: "failed", cause: { kind: "api-error" } },
}

function permission(id: string): PendingAsk {
  return { kind: "permission", id, toolName: "Bash", input: { command: REQUEST_MARK } }
}

function pending(...asks: readonly PendingAsk[]): SessionEvent {
  return { kind: "pending-changed", pending: asks }
}

/**
 * `receive` と同じ順（畳んでから係に見せる）でイベントを流す。
 * 時刻は秒で渡し、ミリ秒に直す。
 */
function createHarness() {
  const entries: ExperienceMetricEntry[] = []
  const recorder = createExperienceMetricRecorder({
    append: (entry) => {
      entries.push(entry)
    },
    readRange: () => [],
  })
  let state: SessionState = INITIAL_SESSION_STATE
  const send = (second: number, event: SessionEvent): void => {
    const at = second * 1000
    state = applySessionEvent(state, event, at)
    recorder.observe(event, state, at)
  }
  const restart = (): void => {
    recorder.noteRestart()
    state = INITIAL_SESSION_STATE
  }
  send(0, SESSION_INFO)
  return { entries, send, restart }
}

describe("createExperienceMetricRecorder", () => {
  it("依頼を送ってから閉じるまでを、閉じた局面と一緒に1行書く", () => {
    const { entries, send } = createHarness()

    send(10, REQUEST)
    send(40, COMPLETED)

    expect(entries).toEqual([
      {
        at: 40_000,
        sessionId: "claude-session-1",
        kind: "conclusion",
        moment: "deliver",
        untilConclusionMs: 30_000,
        askingMs: 0,
        askCount: 0,
      },
    ])
  })

  it("失敗で閉じたときは局面が stumble になる", () => {
    const { entries, send } = createHarness()

    send(10, REQUEST)
    send(25, FAILED)

    expect(entries).toMatchObject([{ moment: "stumble", untilConclusionMs: 15_000 }])
  })

  it("答え待ちの時間を足し、重なったお伺いは1回と数える", () => {
    const { entries, send } = createHarness()

    send(10, REQUEST)
    send(20, pending(permission("p1")))
    send(25, pending(permission("p1"), permission("p2")))
    send(30, pending(permission("p2")))
    send(35, pending())
    send(50, pending(permission("p3")))
    send(52, pending())
    send(60, COMPLETED)

    expect(entries).toMatchObject([{ askingMs: 17_000, askCount: 2, untilConclusionMs: 50_000 }])
  })

  it("閉じたあとの続きのターンでは2行目を書かない", () => {
    const { entries, send } = createHarness()

    send(10, REQUEST)
    send(20, COMPLETED)
    send(30, { kind: "turn-resumed" })
    send(40, COMPLETED)

    expect(entries.length).toBe(1)
  })

  it("つまずいてから deliver で閉じるまでの、送った回数と時間を書く", () => {
    const { entries, send } = createHarness()

    send(10, REQUEST)
    send(20, FAILED)
    send(30, REQUEST)
    send(40, FAILED)
    send(50, REQUEST)
    send(80, COMPLETED)

    expect(entries.filter((entry) => entry.kind === "recovery")).toEqual([
      {
        at: 80_000,
        sessionId: "claude-session-1",
        kind: "recovery",
        hands: 2,
        untilRecoveryMs: 60_000,
      },
    ])
  })

  it("起こし直しも1手と数え、開いていた依頼は書かずに捨てる", () => {
    const { entries, send, restart } = createHarness()

    send(10, REQUEST)
    send(20, { kind: "session-ended", reason: "架空の理由" })
    send(30, REQUEST)
    restart()
    send(40, SESSION_INFO)
    send(50, REQUEST)
    send(70, COMPLETED)

    expect(entries.filter((entry) => entry.kind === "conclusion").length).toBe(2)
    expect(entries.filter((entry) => entry.kind === "recovery")).toMatchObject([
      { hands: 3, untilRecoveryMs: 50_000 },
    ])
  })

  it("雑談モードでは書かない", () => {
    const { entries, send } = createHarness()

    send(5, { kind: "chat-mode-changed", chat: true })
    send(10, REQUEST)
    send(20, COMPLETED)

    expect(entries).toEqual([])
  })

  it("依頼の文面もお伺いの中身も、書いた行に入らない", () => {
    const { entries, send } = createHarness()

    send(10, REQUEST)
    send(15, pending(permission("p1")))
    send(18, pending())
    send(20, FAILED)
    send(30, REQUEST)
    send(40, COMPLETED)

    expect(entries.length).toBe(3)
    expect(JSON.stringify(entries)).not.toContain(REQUEST_MARK)
  })
})
