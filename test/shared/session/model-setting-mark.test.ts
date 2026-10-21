import { describe, expect, it } from "vitest"

import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { apply } from "../../fixture/session-state.ts"

describe("モデルの設定の見届け", () => {
  const RUNNING: SessionEvent = {
    kind: "session-info",
    sessionId: "s1",
    model: "claude-opus-5",
    permissionMode: "default",
    slashCommands: [],
    terminalSlashCommands: [],
    skillNames: [],
    agentNames: [],
  }

  const SONNET_ROW: SessionEvent = {
    kind: "model-effort-support",
    models: [
      {
        model: "sonnet",
        resolvedModel: "claude-sonnet-5-5",
        supportsEffort: true,
        effortLevels: ["low"],
      },
    ],
  }

  it("受け付けたモデルの別名が、表で同じに引ける正規の ID の見届けで confirmed になる", () => {
    const state = apply(
      RUNNING,
      SONNET_ROW,
      { kind: "model-changed", model: "sonnet" },
      { kind: "setting-confirmed", setting: "model", value: "claude-sonnet-5-5" },
    )

    expect(state.settingMarks.model).toEqual({ kind: "confirmed", value: "sonnet", at: 0 })
  })

  it("表が届く前は、別名と正規の ID は別の値なので accepted のまま", () => {
    const state = apply(
      RUNNING,
      { kind: "model-changed", model: "sonnet" },
      { kind: "setting-confirmed", setting: "model", value: "claude-sonnet-5-5" },
    )

    expect(state.settingMarks.model.kind).toBe("accepted")
  })

  it("片方がもう片方を含む別のモデルの見届けでは confirmed にならない", () => {
    const state = apply(
      RUNNING,
      SONNET_ROW,
      { kind: "model-changed", model: "claude-opus-4" },
      { kind: "setting-confirmed", setting: "model", value: "claude-opus-4-1" },
    )

    expect(state.settingMarks.model.kind).toBe("accepted")
  })

  it("違うモデルの見届けでは accepted のまま", () => {
    const state = apply(
      RUNNING,
      { kind: "model-changed", model: "sonnet" },
      { kind: "setting-confirmed", setting: "model", value: "claude-opus-5" },
    )

    expect(state.settingMarks.model.kind).toBe("accepted")
  })
})
