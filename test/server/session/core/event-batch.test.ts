import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createEventBatch,
  EVENT_BATCH_INTERVAL_MS,
} from "../../../../src/server/session/core/event-batch.ts"
import type { SessionEvent, StampedEvent } from "../../../../src/shared/session/session-event.ts"

const SPEECH: SessionEvent = { kind: "speech", text: "架空のセリフ", expression: "default" }
const TURN_FINISHED: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }

function partial(text: string): SessionEvent {
  return { kind: "partial-utterance", text }
}

function stamp(at: number, event: SessionEvent): StampedEvent {
  return { at, event }
}

describe("createEventBatch", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function batch() {
    const delivered: (readonly StampedEvent[])[] = []
    const created = createEventBatch({
      intervalMs: EVENT_BATCH_INTERVAL_MS,
      deliver: (events) => delivered.push(events),
    })
    return { delivered, ...created }
  }

  it("待ちが無いときの書きかけの本文以外は、時計を進めずに1件だけ配られる", () => {
    const { delivered, add } = batch()

    add(stamp(1, SPEECH))

    expect(delivered).toEqual([[stamp(1, SPEECH)]])
  })

  it("即配りの直後に届いたものは、間隔まで配られず1回にまとまる", () => {
    const { delivered, add } = batch()

    add(stamp(1, SPEECH))
    add(stamp(2, partial("架空の")))
    add(stamp(3, TURN_FINISHED))
    vi.advanceTimersByTime(EVENT_BATCH_INTERVAL_MS - 1)
    expect(delivered).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(delivered).toEqual([
      [stamp(1, SPEECH)],
      [stamp(2, partial("架空の")), stamp(3, TURN_FINISHED)],
    ])
  })

  it("待ちが無いときの書きかけの本文だけの連なりは、間隔で1件に連結されて配られる", () => {
    const { delivered, add } = batch()

    add(stamp(1, partial("架空の")))
    add(stamp(2, partial("本文")))
    expect(delivered).toEqual([])

    vi.advanceTimersByTime(EVENT_BATCH_INTERVAL_MS)
    expect(delivered).toEqual([[stamp(2, partial("架空の本文"))]])
  })

  it("配られたイベントの時刻は昇順に並ぶ", () => {
    const { delivered, add } = batch()

    add(stamp(1, SPEECH))
    add(stamp(2, partial("あ")))
    add(stamp(3, TURN_FINISHED))
    vi.advanceTimersByTime(EVENT_BATCH_INTERVAL_MS)

    const ats = delivered.flat().map((stamped) => stamped.at)
    expect(ats).toEqual(ats.toSorted((a, b) => a - b))
  })

  it("間隔が過ぎて空になったあとの単発は、また即配りになる", () => {
    const { delivered, add } = batch()

    add(stamp(1, SPEECH))
    vi.advanceTimersByTime(EVENT_BATCH_INTERVAL_MS)
    add(stamp(2, TURN_FINISHED))

    expect(delivered).toEqual([[stamp(1, SPEECH)], [stamp(2, TURN_FINISHED)]])
  })

  it("discard したあとは、積んだものも待っていた配りも出ない", () => {
    const { delivered, add, discard } = batch()

    add(stamp(1, SPEECH))
    add(stamp(2, partial("あ")))
    discard()
    vi.advanceTimersByTime(EVENT_BATCH_INTERVAL_MS * 2)

    expect(delivered).toEqual([[stamp(1, SPEECH)]])
  })
})
