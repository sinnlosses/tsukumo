// 撮影の道具が場面の終わりを待つ部品（scene-end）を検証する。

import { afterEach, describe, expect, test, vi } from "vitest"

import {
  countEventKinds,
  sceneEndTarget,
  sceneEventTimeoutMs,
  sceneWindowPlan,
  type WatchedPage,
  watchSceneEvents,
} from "../../../scripts/capture/lib/scene-end.ts"
import {
  type FakeSession,
  type FakeSessionStep,
  startupSteps,
} from "../../../src/server/session-driver/adapter/fake-session.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { bundledFakeSession } from "../../fixture/bundled-fake-session.ts"

afterEach(() => {
  vi.useRealTimers()
})

const FINISHED: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }
const STARTED: SessionEvent = { kind: "turn-started" }

function step(afterMs: number, event: SessionEvent): FakeSessionStep {
  return { afterMs, event, waitForAnswer: false }
}

function sessionOf(
  opening: readonly FakeSessionStep[],
  scene: readonly FakeSessionStep[],
): FakeSession {
  return {
    opening,
    turns: [{ name: "場面", resume: undefined, steps: scene }],
    pastSessions: [],
    sessionDigests: {},
    usageReview: { review: [], proposal: [] },
  }
}

/** 画面の WebSocket が受ける `events` フレームの text（oRPC の封筒つき）。 */
function eventsFrame(events: readonly SessionEvent[]): string {
  return JSON.stringify({
    i: "1",
    t: 3,
    p: {
      e: "message",
      d: { json: { type: "events", events: events.map((event) => ({ at: 0, event })) } },
    },
  })
}

function split(events: readonly SessionEvent[], size: number): readonly string[] {
  return Array.from({ length: Math.ceil(events.length / size) }, (_, index) =>
    eventsFrame(events.slice(index * size, (index + 1) * size)),
  )
}

/** `watchSceneEvents` へ渡す偽のページ。`open()` で接続を1本開き、`send` でフレームを届ける。 */
function fakePage(): {
  readonly page: WatchedPage
  readonly open: () => (payload: string) => void
} {
  let onSocket: Parameters<WatchedPage["on"]>[1] | undefined
  return {
    page: {
      on: (_event, handler) => {
        onSocket = handler
      },
    },
    open: () => {
      let onFrame: ((frame: { readonly payload: string }) => void) | undefined
      onSocket?.({
        on: (_event, handler) => {
          onFrame = handler
        },
      })
      return (payload) => onFrame?.({ payload })
    },
  }
}

describe("sceneEndTarget", () => {
  test("最後の手の kind と、その kind の手の総数を返す", () => {
    const session = sessionOf([], [step(100, STARTED), step(200, FINISHED), step(300, FINISHED)])

    expect(sceneEndTarget(session, "場面", undefined)).toEqual({
      kind: "turn-finished",
      occurrence: 2,
    })
  })

  test("最後の手の kind が turn-finished でなくても、その kind を返す", () => {
    const session = sessionOf([], [step(100, FINISHED), step(200, STARTED)])

    expect(sceneEndTarget(session, "場面", undefined)).toEqual({
      kind: "turn-started",
      occurrence: 1,
    })
  })

  test("opening の同じ kind の手も数える（場面の手と同じ kind が opening にもあるとき）", () => {
    const session = sessionOf([step(100, FINISHED)], [step(50, FINISHED)])

    expect(sceneEndTarget(session, "場面", undefined)).toEqual({
      kind: "turn-finished",
      occurrence: 2,
    })
  })

  test("afterMs が 0 の手は hello に畳まれうるので数えない", () => {
    const session = sessionOf([step(0, FINISHED)], [step(0, FINISHED), step(100, FINISHED)])

    expect(sceneEndTarget(session, "場面", undefined)).toEqual({
      kind: "turn-finished",
      occurrence: 1,
    })
  })

  test("until で手を切ると、切った最後の手で決まる", () => {
    const session = sessionOf([], [step(100, STARTED), step(200, FINISHED), step(300, FINISHED)])

    expect(sceneEndTarget(session, "場面", 2)).toEqual({ kind: "turn-finished", occurrence: 1 })
  })

  test("数える手が無ければ undefined", () => {
    expect(sceneEndTarget(sessionOf([], []), "場面", undefined)).toBeUndefined()
  })
})

describe("sceneEventTimeoutMs", () => {
  const session = sessionOf([], [step(100, STARTED), step(1500, FINISHED), step(16_000, FINISHED)])

  test("指した手の afterMs に猶予 10 秒を足す", () => {
    expect(
      sceneEventTimeoutMs(session, "場面", undefined, { kind: "turn-finished", occurrence: 1 }),
    ).toBe(1500 + 10_000)
    expect(
      sceneEventTimeoutMs(session, "場面", undefined, { kind: "turn-finished", occurrence: 2 }),
    ).toBe(16_000 + 10_000)
  })

  test("場面に無い手を指すと undefined", () => {
    expect(
      sceneEventTimeoutMs(session, "場面", undefined, { kind: "turn-finished", occurrence: 3 }),
    ).toBeUndefined()
  })
})

describe("countEventKinds", () => {
  test("events フレームの kind ごとの件数を数える", () => {
    expect([...countEventKinds(eventsFrame([STARTED, FINISHED, FINISHED]))]).toEqual([
      ["turn-started", 1],
      ["turn-finished", 2],
    ])
  })

  test("events でないフレームと読めないフレームは空", () => {
    const hello = JSON.stringify({
      i: "1",
      t: 3,
      p: { e: "message", d: { json: { type: "refresh", target: "ui" } } },
    })

    expect(countEventKinds(hello).size).toBe(0)
    expect(countEventKinds("{").size).toBe(0)
    expect(countEventKinds(JSON.stringify({ i: "1", p: { h: {} } })).size).toBe(0)
  })

  test("フレームの分け方に依らず、同梱の疑似セッションの全場面で、数える手の kind ごとの総数と一致する", () => {
    const session = bundledFakeSession()
    for (const scene of session.turns) {
      const events = startupSteps(session, scene.name, undefined)
        .filter((candidate) => candidate.afterMs > 0)
        .map((candidate) => candidate.event)
      const expected = new Map<string, number>()
      for (const event of events) {
        expected.set(event.kind, (expected.get(event.kind) ?? 0) + 1)
      }
      for (const size of [1, 3, Math.max(events.length, 1)]) {
        const received = new Map<string, number>()
        for (const frame of split(events, size)) {
          for (const [kind, count] of countEventKinds(frame)) {
            received.set(kind, (received.get(kind) ?? 0) + count)
          }
        }
        expect(received, `${scene.name}（${String(size)} 件ずつ）`).toEqual(expected)
      }
    }
  })
})

describe("watchSceneEvents", () => {
  test("target の件数に届くまで待ち、届いたら解ける（フレームに分けて届いても足し上げる）", async () => {
    const { page, open } = fakePage()
    const watch = watchSceneEvents(page)
    const send = open()
    let settled = false
    const waiting = watch
      .waitFor({ kind: "turn-finished", occurrence: 3 }, { scene: "場面", timeoutMs: 5000 })
      .then(() => {
        settled = true
      })

    send(eventsFrame([STARTED, FINISHED]))
    send(eventsFrame([FINISHED]))
    await Promise.resolve()
    expect(settled).toBe(false)

    send(eventsFrame([STARTED, FINISHED]))
    await waiting
    expect(settled).toBe(true)
  })

  test("すでに届いていれば、待たずに解ける", async () => {
    const { page, open } = fakePage()
    const watch = watchSceneEvents(page)
    open()("{")
    const send = open()
    send(eventsFrame([FINISHED]))

    await expect(
      watch.waitFor({ kind: "turn-finished", occurrence: 1 }, { scene: "場面", timeoutMs: 5000 }),
    ).resolves.toBeUndefined()
  })

  test("上限まで届かなければ、場面名・待った kind と件数・届いた件数・上限を載せて投げる", async () => {
    vi.useFakeTimers()
    const { page, open } = fakePage()
    const watch = watchSceneEvents(page)
    open()(eventsFrame([FINISHED]))
    const waiting = watch.waitFor(
      { kind: "turn-finished", occurrence: 2 },
      { scene: "report-tool", timeoutMs: 4000 },
    )
    const outcome = waiting.then(
      () => "解けた",
      (error: unknown) => error,
    )

    await vi.advanceTimersByTimeAsync(4000)

    expect(await outcome).toEqual(
      new Error(
        "場面の終わりが届かなかった: report-tool（turn-finished を 2 件待った・1 件・上限 4000ms）",
      ),
    )
  })

  test("監視を始める前に開いた接続のフレームは数えない（page.goto より前に登録する契約）", async () => {
    vi.useFakeTimers()
    const { page, open } = fakePage()
    const earlySend = open()
    const watch = watchSceneEvents(page)
    earlySend(eventsFrame([FINISHED]))
    const outcome = watch
      .waitFor({ kind: "turn-finished", occurrence: 1 }, { scene: "場面", timeoutMs: 1000 })
      .then(
        () => "解けた",
        (error: unknown) => error,
      )

    await vi.advanceTimersByTimeAsync(1000)

    expect(await outcome).toBeInstanceOf(Error)
  })
})

describe("sceneWindowPlan", () => {
  test("最後の手まで待つ件は、最初の窓だけ待ち、場面は起こし直さない", () => {
    expect(sceneWindowPlan({ kind: "scene-end" }, 0)).toEqual({ relaunches: false, waits: true })
    expect(sceneWindowPlan({ kind: "scene-end" }, 1)).toEqual({ relaunches: false, waits: false })
  })

  test("途中の手を待つ件は、2枚目の窓から場面を起こし直し、どの窓でも同じ手を待つ", () => {
    const settle = { kind: "scene-event", eventKind: "tool-started", occurrence: 4 } as const

    expect(sceneWindowPlan(settle, 0)).toEqual({ relaunches: false, waits: true })
    expect(sceneWindowPlan(settle, 1)).toEqual({ relaunches: true, waits: true })
  })
})
