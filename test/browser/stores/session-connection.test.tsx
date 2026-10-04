// 届いたフレームのうち、画面の外のキャッシュに用があるものを `useSessionConnection` が捌くことを見る。
// 日記が書き上がったとき（`diary-written`）、成果の画面のクエリが取り直し対象になる。

import { renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { queryClient } from "../../../src/browser/domain/query-client.ts"
import { rpc } from "../../../src/browser/domain/rpc.ts"
import type { SessionSocketHandlers } from "../../../src/browser/lib/socket.ts"
import { useSessionConnection } from "../../../src/browser/stores/session.ts"
import { PROTOCOL_VERSION, type ServerFrame } from "../../../src/shared/frame.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { INITIAL_SESSION_STATE } from "../../../src/shared/session/session-state.ts"

let handlers: SessionSocketHandlers | undefined = undefined

vi.mock("../../../src/browser/lib/socket.ts", () => ({
  connectSessionSocket: (_path: string, given: SessionSocketHandlers) => {
    handlers = given
    return { commandLink: { call: () => Promise.resolve(undefined) }, close: () => {} }
  },
}))

const ACHIEVEMENT_DAY_KEY = rpc.achievement.day.queryKey({ input: { kind: "today" } })

beforeEach(() => {
  queryClient.setQueryData(ACHIEVEMENT_DAY_KEY, { kind: "unknown" })
})

afterEach(() => {
  queryClient.clear()
  handlers = undefined
})

function eventsFrame(event: SessionEvent): ServerFrame {
  return { type: "events", events: [{ event, at: 0 }] }
}

function isInvalidated(): boolean {
  return queryClient.getQueryState(ACHIEVEMENT_DAY_KEY)?.isInvalidated === true
}

function connect(): SessionSocketHandlers {
  renderHook(() => {
    useSessionConnection()
  })
  if (handlers === undefined) {
    throw new Error("接続が張られていない")
  }
  return handlers
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
