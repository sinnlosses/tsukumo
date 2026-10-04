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
    expect(strip.kind === "working" && strip.phases.map((phase) => phase.state)).toEqual([
      "asking",
      "upcoming",
    ])
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
  it("送った直後から、段の丸の無い「作業中」の帯を回る印つきで出す", () => {
    const state = foldTimed([[request, START]])

    const strip = stripAt(state, START + 12_000)

    expect(strip).toMatchObject({
      kind: "working",
      phases: [],
      spinning: true,
      headLabel: "作業中",
      sideLabel: "経過 12秒",
    })
  })

  it("段取りの無いまま閉じたら、帯ごと消す", () => {
    const state = foldTimed([
      [request, START],
      [{ kind: "turn-finished", outcome: { kind: "completed" } }, START + 5_000],
    ])

    expect(stripAt(state, START + 6_000)).toEqual({ kind: "none" })
  })
})
