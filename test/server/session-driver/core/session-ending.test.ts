import { describe, expect, it } from "vitest"

import { createSessionEnding } from "../../../../src/server/session-driver/core/session-ending.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"

const UTTERANCE: SessionEvent = { kind: "utterance", text: "架空の本文" }
const ENDED: SessionEvent = { kind: "session-ended", reason: "架空の理由" }

describe("createSessionEnding", () => {
  it("受け手が1回投げても、失敗を渡して次のイベントを流し続ける", () => {
    const received: SessionEvent[] = []
    const failures: unknown[] = []
    const failure = new Error("架空の失敗")
    let first = true
    const ending = createSessionEnding(
      (event) => {
        if (first) {
          first = false
          throw failure
        }
        received.push(event)
      },
      (error) => failures.push(error),
    )

    ending.deliver(UTTERANCE)
    ending.deliver(UTTERANCE)

    expect(failures).toEqual([failure])
    expect(received).toEqual([UTTERANCE])
    expect(ending.ended()).toBe(false)
  })

  it("session-ended を流したあとは ended が真になる（受け手が投げても）", () => {
    const ending = createSessionEnding(
      () => {
        throw new Error("架空の失敗")
      },
      () => {},
    )

    expect(ending.ended()).toBe(false)
    ending.deliver(ENDED)

    expect(ending.ended()).toBe(true)
  })
})
