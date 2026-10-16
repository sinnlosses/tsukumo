import { describe, expect, it } from "vitest"

import { createExternalToolMark } from "../../../../src/server/session-driver/core/external-tool-mark.ts"
import { withSelfStartedTurns } from "../../../../src/server/session-driver/core/self-started-turn.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"

const INIT: SessionEvent = {
  kind: "session-info",
  sessionId: "fake-session",
  model: "opus",
  permissionMode: "auto",
  slashCommands: [],
  terminalSlashCommands: [],
  skillNames: [],
  agentNames: [],
}
const REQUEST: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
const FINISHED: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }

describe("createExternalToolMark", () => {
  it("tsukumo のツールだけなら remember を通す", () => {
    const mark = createExternalToolMark()
    mark.observeTool("mcp__tsukumo__speak")
    mark.observeTool("mcp__tsukumo__recall")
    mark.observeTool("mcp__tsukumo__recall_episode")
    mark.observeTool("mcp__tsukumo__架空の新しいツール")
    expect(mark.allowsRemember()).toBe(true)
  })

  it.each([
    "Read",
    "WebFetch",
    "mcp__other__fetch",
    "Agent",
    "mcp__tsukumo_extra__speak",
    "mcp__other__mcp__tsukumo__speak",
  ])("%s を1回見たら remember を拒む", (toolName) => {
    const mark = createExternalToolMark()
    mark.observeTool("mcp__tsukumo__speak")
    mark.observeTool(toolName)
    expect(mark.allowsRemember()).toBe(false)
  })

  it("依頼（request・turn-started）を送ると下り、脇の話とターンの終わりでは下りない", () => {
    const mark = createExternalToolMark()
    mark.observeTool("Read")
    mark.observe({ kind: "aside", text: "架空の脇の話", images: [] })
    mark.observe(FINISHED)
    expect(mark.allowsRemember()).toBe(false)

    mark.observe(REQUEST)
    expect(mark.allowsRemember()).toBe(true)

    mark.observeTool("Bash")
    mark.observe({ kind: "turn-started" })
    expect(mark.allowsRemember()).toBe(true)
  })

  it("claude が自分で始めた続きのターン（背景のタスクの続き）では下りない", () => {
    const mark = createExternalToolMark()
    const relay = withSelfStartedTurns(mark.observe)
    relay(REQUEST)
    relay(INIT)
    mark.observeTool("Bash")
    relay(FINISHED)
    relay(INIT)
    expect(mark.allowsRemember()).toBe(false)
  })

  it("作った口ごとに別の印を持つ（駆動どうしで混ざらない）", () => {
    const first = createExternalToolMark()
    const second = createExternalToolMark()
    first.observeTool("WebFetch")
    expect(second.allowsRemember()).toBe(true)
    second.observe(REQUEST)
    expect(first.allowsRemember()).toBe(false)
  })
})
