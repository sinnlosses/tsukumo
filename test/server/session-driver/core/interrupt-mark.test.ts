import { describe, expect, it } from "vitest"

import { createInterruptMark } from "../../../../src/server/session-driver/core/interrupt-mark.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { requestEvent } from "../../../fixture/session-event.ts"

const TURN_FINISHED: SessionEvent = { kind: "turn-finished", outcome: { kind: "interrupted" } }

describe("createInterruptMark", () => {
  it("中断を送ると立ち、ターンの終わりで下りる", () => {
    const mark = createInterruptMark()

    expect(mark.sent()).toBe(false)
    mark.send()
    expect(mark.sent()).toBe(true)
    mark.observe(TURN_FINISHED)
    expect(mark.sent()).toBe(false)
  })

  it.each<SessionEvent>([
    requestEvent("依頼"),
    { kind: "aside", text: "脇の話", images: [] },
    { kind: "turn-started" },
    { kind: "progress-nudged" },
  ])("動いていないときに送った中断の印は、次のターンを始める $kind で下りる", (turnOpening) => {
    const mark = createInterruptMark()

    mark.send()
    mark.observe(turnOpening)

    expect(mark.sent()).toBe(false)
  })

  it("ターンの途中のイベントでは下りない", () => {
    const mark = createInterruptMark()

    mark.send()
    mark.observe({ kind: "turn-resumed" })

    expect(mark.sent()).toBe(true)
  })
})
