import { describe, expect, it } from "vitest"

import { createPromptDelayWatch } from "../../../../src/server/session-driver/core/prompt-delay.ts"
import { handOffPrompt } from "../../../../src/server/session-driver/core/prompt-handoff.ts"

describe("handOffPrompt", () => {
  it("渡す、足跡の起点、記録の順に走り、渡した id を返す", () => {
    const calls: string[] = []
    const watch = createPromptDelayWatch(() => undefined)
    const pushed = watch.pushed
    let clock = 100

    const id = handOffPrompt({
      now: () => {
        clock += 5
        return clock
      },
      watch: {
        ...watch,
        pushed: (at, startedAt) => {
          calls.push(`pushed:${String(at - (startedAt ?? at))}`)
          pushed(at, startedAt)
        },
      },
      push: () => {
        calls.push("push")
        return "架空のid"
      },
      record: () => {
        calls.push("record")
      },
    })

    expect(calls).toEqual(["push", "pushed:5", "record"])
    expect(id).toBe("架空のid")
  })
})
