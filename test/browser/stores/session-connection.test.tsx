// `useSessionConnection` が届いたフレームを捌くことを見る。
// 日記が書き上がったとき（`diary-written`）、成果の画面のクエリが取り直し対象になる。
// `events` は描画の手前（rAF）まで溜めて1回で store へ渡し、ページが隠れている間は表に戻るまで溜める。

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { queryClient } from "../../../src/browser/domain/query-client.ts"
import { rpc } from "../../../src/browser/domain/rpc.ts"
import type { connectSessionSocket } from "../../../src/browser/lib/socket.ts"
import { useSession, useSessionConnection } from "../../../src/browser/stores/session.ts"
import { PROTOCOL_VERSION, type ServerFrame } from "../../../src/shared/frame.ts"
import type { StampedPendingAsk } from "../../../src/shared/session-driver/pending-ask.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../src/shared/session/session-state.ts"
import { reportEvent } from "../../fixture/report-event.ts"
import { requestEvent } from "../../fixture/session-event.ts"
import { putSession, stateWith } from "../session-store.ts"

type SessionSocketHandlers = Parameters<typeof connectSessionSocket>[1]

let handlers: SessionSocketHandlers | undefined = undefined

vi.mock("../../../src/browser/lib/socket.ts", () => ({
  connectSessionSocket: (_path: string, given: SessionSocketHandlers) => {
    handlers = given
    return { commandLink: { call: () => Promise.resolve(undefined) }, close: () => {} }
  },
}))

const ACHIEVEMENT_DAY_KEY = rpc.achievement.day.queryKey({ input: { kind: "today" } })

/** 予約された描画の手前の呼び出し。`runAnimationFrame` で1回ぶん流す。 */
let animationFrames: Map<number, FrameRequestCallback> = new Map()
let nextAnimationFrameId = 1
let pageHidden = false
const unsubscribers: (() => void)[] = []

beforeEach(() => {
  queryClient.setQueryData(ACHIEVEMENT_DAY_KEY, { kind: "unknown" })
  animationFrames = new Map()
  pageHidden = false
  vi.spyOn(document, "hidden", "get").mockImplementation(() => pageHidden)
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = nextAnimationFrameId++
    animationFrames.set(id, callback)
    return id
  })
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    animationFrames.delete(id)
  })
})

afterEach(() => {
  cleanup()
  for (const unsubscribe of unsubscribers.splice(0)) {
    unsubscribe()
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  queryClient.clear()
  handlers = undefined
})

function connect(): SessionSocketHandlers {
  renderHook(() => {
    useSessionConnection()
  })
  if (handlers === undefined) {
    throw new Error("接続が張られていない")
  }
  return handlers
}

function eventsFrame(...events: readonly SessionEvent[]): ServerFrame {
  return { type: "events", events: events.map((event) => ({ event, at: 0 })) }
}

function isInvalidated(): boolean {
  return queryClient.getQueryState(ACHIEVEMENT_DAY_KEY)?.isInvalidated === true
}

function setPageHidden(hidden: boolean): void {
  pageHidden = hidden
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"))
  })
}

function runAnimationFrame(): void {
  const callbacks = [...animationFrames.values()]
  animationFrames = new Map()
  act(() => {
    for (const callback of callbacks) {
      callback(0)
    }
  })
}

function countSets(): () => number {
  let sets = 0
  unsubscribers.push(
    useSession.subscribe((next, previous) => {
      if (next.state !== previous.state) {
        sets += 1
      }
    }),
  )
  return () => sets
}

function recordKinds(): readonly string[] {
  return useSession.getState().state.records.map((record) => record.kind)
}

const REQUEST = requestEvent()
const SPEECH: SessionEvent = { kind: "speech", text: "架空のセリフ", expression: "default" }
const PERMISSION: StampedPendingAsk = {
  kind: "permission",
  id: "ask-1",
  toolName: "Read",
  input: {},
  askedAt: 0,
}

describe("useSessionConnection（日記の書き上がり）", () => {
  it("diary-written を含むフレームで、成果の画面のクエリを取り直し対象にする", () => {
    const connected = connect()

    connected.onFrame(eventsFrame({ kind: "diary-written", date: "2026-09-24" }))

    expect(isInvalidated()).toBe(true)
  })

  it("繋ぎ直しの hello でも取り直し対象にする（切断中に書き上がったぶんを拾う）", () => {
    const connected = connect()

    connected.onFrame({
      type: "hello",
      protocolVersion: PROTOCOL_VERSION,
      state: INITIAL_SESSION_STATE,
    })

    expect(isInvalidated()).toBe(true)
  })

  it("diary-written を含まないフレームでは取り直し対象にしない", () => {
    const connected = connect()

    connected.onFrame(eventsFrame({ kind: "diary-requested", date: "2026-09-24" }))

    expect(isInvalidated()).toBe(false)
  })
})

describe("useSessionConnection（届くフレームの束ね方）", () => {
  it("描画の手前までに届いた2つの events は、1回の差し替えで両方畳まれる", () => {
    putSession(INITIAL_SESSION_STATE)
    const connected = connect()
    const sets = countSets()

    connected.onFrame(eventsFrame(REQUEST))
    connected.onFrame(eventsFrame(SPEECH))
    expect(sets()).toBe(0)

    runAnimationFrame()

    expect(sets()).toBe(1)
    expect(useSession.getState().state.turn.kind).toBe("running")
    expect(recordKinds()).toEqual(["request", "speech"])
  })

  it("hello は描画を待たずにその場で姿を置き換え、溜めていた events は捨てる", () => {
    putSession(INITIAL_SESSION_STATE)
    const connected = connect()
    const generation = useSession.getState().generation
    const replaced = stateWith({ nextTurnId: 7 })

    connected.onFrame(eventsFrame(REQUEST))
    connected.onFrame({ type: "hello", protocolVersion: PROTOCOL_VERSION, state: replaced })

    expect(useSession.getState().state).toBe(replaced)
    expect(useSession.getState().generation).toBe(generation + 1)

    runAnimationFrame()

    expect(useSession.getState().state).toBe(replaced)
  })

  it("1回に束ねても、report と turn-finished は届いた順に畳まれる", () => {
    putSession(INITIAL_SESSION_STATE)
    const connected = connect()
    connected.onFrame(eventsFrame(REQUEST))
    runAnimationFrame()
    const before = useSession.getState().state
    const report = reportEvent({ toolUseId: "toolu_r1" })
    const finished: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }
    const next = requestEvent("架空の次の依頼")

    connected.onFrame(eventsFrame(report))
    connected.onFrame(eventsFrame(finished))
    connected.onFrame(eventsFrame(next))
    runAnimationFrame()

    expect(useSession.getState().state).toEqual(
      [report, finished, next].reduce((state, event) => applySessionEvent(state, event, 0), before),
    )
    // 次の依頼が終わりより後に畳まれたので、ターンは走っている。
    expect(useSession.getState().state.turn.kind).toBe("running")
  })
})

describe("useSessionConnection（ページが隠れている間）", () => {
  it("隠れている間は差し替えず、表に戻ると1回で最新の姿になる", () => {
    putSession(INITIAL_SESSION_STATE)
    const connected = connect()
    const sets = countSets()

    connected.onFrame(eventsFrame(REQUEST))
    setPageHidden(true)
    connected.onFrame(eventsFrame(SPEECH))
    // 隠れる前に予約した描画の手前の呼び出しが、隠れたあとに呼ばれても渡さない。
    runAnimationFrame()
    expect(sets()).toBe(0)

    setPageHidden(false)

    expect(sets()).toBe(1)
    expect(recordKinds()).toEqual(["request", "speech"])
  })

  it("隠れている間に溜めても、report と turn-finished は届いた順に畳まれる", () => {
    putSession(INITIAL_SESSION_STATE)
    const connected = connect()
    connected.onFrame(eventsFrame(REQUEST))
    runAnimationFrame()
    const before = useSession.getState().state
    const report = reportEvent({ toolUseId: "toolu_r1" })
    const finished: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }
    const next = requestEvent("架空の次の依頼")

    setPageHidden(true)
    connected.onFrame(eventsFrame(report))
    connected.onFrame(eventsFrame(finished))
    connected.onFrame(eventsFrame(next))
    setPageHidden(false)

    expect(useSession.getState().state).toEqual(
      [report, finished, next].reduce((state, event) => applySessionEvent(state, event, 0), before),
    )
    expect(useSession.getState().state.turn.kind).toBe("running")
  })

  it("隠れていても pending-changed を含むフレームが来たら、溜めた分と合わせて到着順に1回で渡す", () => {
    putSession(INITIAL_SESSION_STATE)
    const connected = connect()
    const sets = countSets()

    setPageHidden(true)
    connected.onFrame(eventsFrame(REQUEST))
    connected.onFrame(eventsFrame(SPEECH))
    expect(sets()).toBe(0)

    act(() => {
      connected.onFrame(eventsFrame({ kind: "pending-changed", pending: [PERMISSION] }))
    })

    expect(sets()).toBe(1)
    expect(recordKinds()).toEqual(["request", "speech"])
    expect(useSession.getState().state.pending).toEqual([PERMISSION])
  })

  it("隠れている間、pending-changed を含まないフレームは表に戻るまで溜まる", () => {
    putSession(INITIAL_SESSION_STATE)
    const connected = connect()
    const sets = countSets()

    setPageHidden(true)
    connected.onFrame(eventsFrame(REQUEST))
    connected.onFrame(eventsFrame(SPEECH))
    runAnimationFrame()

    expect(sets()).toBe(0)
    expect(recordKinds()).toEqual([])
  })

  it("隠れていても hello はその場で置き換え、表に戻ったときに溜めた events を渡さない", () => {
    putSession(INITIAL_SESSION_STATE)
    const connected = connect()
    const replaced = stateWith({ nextTurnId: 7 })

    setPageHidden(true)
    connected.onFrame(eventsFrame(REQUEST))
    connected.onFrame({ type: "hello", protocolVersion: PROTOCOL_VERSION, state: replaced })
    expect(useSession.getState().state).toBe(replaced)

    setPageHidden(false)

    expect(useSession.getState().state).toBe(replaced)
  })
})
