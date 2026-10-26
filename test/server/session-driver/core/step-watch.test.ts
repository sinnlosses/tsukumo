import { describe, expect, it } from "vitest"

import { createStepWatch } from "../../../../src/server/session-driver/core/step-watch.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"

const tool = (parentToolUseId?: string): SessionEvent => ({
  kind: "tool-started",
  toolUseId: "toolu_a",
  name: "Read",
  input: {},
  parentToolUseId,
})
const turnFinished: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }

function feed(watch: ReturnType<typeof createStepWatch>, event: SessionEvent, times: number) {
  return Array.from({ length: times }, () => watch.observe(event))
}

describe("createStepWatch", () => {
  it("上限ちょうどまでは知らせず、超えた最初の 1 回だけ知らせる", () => {
    const watch = createStepWatch(3)
    expect(feed(watch, tool(), 5)).toEqual(["none", "none", "none", "exceeded", "none"])
  })

  it("サブエージェントの中のツール呼び出しは数えない", () => {
    const watch = createStepWatch(1)
    expect(feed(watch, tool("toolu_agent"), 5)).toEqual(["none", "none", "none", "none", "none"])
  })

  it("ターンが終わると数え直し、次のターンでもう 1 度知らせる", () => {
    const watch = createStepWatch(2)
    expect(feed(watch, tool(), 3)).toEqual(["none", "none", "exceeded"])
    expect(watch.observe(turnFinished)).toBe("none")
    expect(feed(watch, tool(), 3)).toEqual(["none", "none", "exceeded"])
  })
})
