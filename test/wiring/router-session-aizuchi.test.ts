import { describe, expect, it } from "vitest"

import { FRAME_ERROR_REASON } from "../../src/shared/frame-error-reason.ts"
import type { SessionEvent } from "../../src/shared/session/session-event.ts"
import { characterChangedEvent } from "../fixture/character.ts"
import { REQUEST_EVENT, startRouter } from "../fixture/command-router.ts"

// すべて手で書いた架空の札と返事。

const PAIR = { chip: "架空の札", reply: "架空の返事", expression: "proud" } as const
const THREE = [PAIR, PAIR, PAIR] as const
const WRITTEN = {
  kind: "aizuchi-written",
  pairs: { deliver: THREE, stumble: THREE, work: THREE },
} as const satisfies SessionEvent

function startWritten(before: readonly SessionEvent[]) {
  const router = startRouter()
  router.observe(characterChangedEvent())
  router.observe(WRITTEN)
  before.forEach(router.observe)
  return router
}

describe("createSocketRouter（session.pressAizuchi）", () => {
  it("作業中でも、出している札なら aizuchi-pressed を流し、駆動には何も送らない", async () => {
    const { commands, emitted, stub } = startWritten([REQUEST_EVENT])

    expect(await commands.session.pressAizuchi({ moment: "work", index: 0 })).toEqual({ ok: true })

    expect(emitted).toEqual([{ kind: "aizuchi-pressed", moment: "work", index: 0 }])
    expect(stub.calls).toEqual([])
  })

  it.each([
    ["いまの局面でない札", { moment: "deliver", index: 0 }],
    ["出していない番号の札", { moment: "work", index: 2 }],
  ] as const)("%sは断って流さない", async (_, input) => {
    const { commands, emitted } = startWritten([REQUEST_EVENT])

    expect(await commands.session.pressAizuchi(input)).toEqual({
      ok: false,
      reason: FRAME_ERROR_REASON.aizuchiNotShown,
    })
    expect(emitted).toEqual([])
  })

  it("押した札を続けて押しても、2回目は断る", async () => {
    const { commands, emitted, observe } = startWritten([REQUEST_EVENT])

    await commands.session.pressAizuchi({ moment: "work", index: 0 })
    observe({ kind: "aizuchi-pressed", moment: "work", index: 0 })

    expect(await commands.session.pressAizuchi({ moment: "work", index: 0 })).toEqual({
      ok: false,
      reason: FRAME_ERROR_REASON.aizuchiNotShown,
    })
    expect(emitted).toHaveLength(1)
  })
})
