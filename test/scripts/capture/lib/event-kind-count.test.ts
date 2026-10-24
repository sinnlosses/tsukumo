import { describe, expect, test } from "vitest"

import { countEventKinds } from "../../../../scripts/capture/lib/event-kind-count.ts"
import { startupSteps } from "../../../../src/server/session-driver/adapter/fake-session.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { bundledFakeSession } from "../../../fixture/bundled-fake-session.ts"
import { eventsFrame } from "../../../fixture/events-frame.ts"

const FINISHED: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }
const STARTED: SessionEvent = { kind: "turn-started" }

function split(events: readonly SessionEvent[], size: number): readonly string[] {
  return Array.from({ length: Math.ceil(events.length / size) }, (_, index) =>
    eventsFrame(events.slice(index * size, (index + 1) * size)),
  )
}

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
