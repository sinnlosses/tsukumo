import { describe, expect, it } from "bun:test"

import { EFFORT_LEVELS, parseClientCommand, PERMISSION_MODES } from "../../src/shared/command.ts"
import {
  BUILTIN_SESSION_DEFAULT,
  isSessionDefaultPermissionMode,
  SESSION_DEFAULT_PERMISSION_MODES,
} from "../../src/shared/session-default.ts"

// 新しいセッションの既定（docs/requirements.md 4.1 / docs/screen-design.md 13.6）。
describe("既定に選べる許可モード", () => {
  it("「全部許す」（bypassPermissions）だけを落とした一覧になっている", () => {
    expect([...SESSION_DEFAULT_PERMISSION_MODES]).toEqual(
      PERMISSION_MODES.filter((mode) => mode !== "bypassPermissions"),
    )
  })

  it("「全部許す」は既定として受け付けない", () => {
    expect(isSessionDefaultPermissionMode("bypassPermissions")).toBe(false)
    expect(isSessionDefaultPermissionMode("plan")).toBe(true)
    expect(isSessionDefaultPermissionMode("no-such-mode")).toBe(false)
  })

  it("同梱の既定は Opus・medium・auto", () => {
    expect(BUILTIN_SESSION_DEFAULT).toEqual({
      model: "opus",
      effort: "medium",
      permissionMode: "auto",
    })
  })
})

// effort は除外する値が無いので、既定に選べる段は EFFORT_LEVELS をそのまま使う
// （SessionDefaultPermissionMode のような部分集合の型を別に作らない）。
describe("既定に選べる effort", () => {
  it("EFFORT_LEVELS の5段をそのまま使う（部分集合を作らない）", () => {
    expect(BUILTIN_SESSION_DEFAULT.effort).toBe("medium")
    expect(EFFORT_LEVELS).toContain(BUILTIN_SESSION_DEFAULT.effort)
  })
})

describe("set-session-default コマンド", () => {
  it("モデル・effort・許可モードの組を受け付ける", () => {
    expect(
      parseClientCommand({
        type: "set-session-default",
        commandId: "c-1",
        model: "sonnet",
        effort: "high",
        permissionMode: "plan",
      }),
    ).toEqual({
      type: "set-session-default",
      commandId: "c-1",
      model: "sonnet",
      effort: "high",
      permissionMode: "plan",
    })
  })

  it("「全部許す」は境界で落とす（画面に選択肢が無いだけにしない）", () => {
    expect(
      parseClientCommand({
        type: "set-session-default",
        commandId: "c-1",
        model: "sonnet",
        effort: "medium",
        permissionMode: "bypassPermissions",
      }),
    ).toBeUndefined()
  })

  it("知らないモデル名は落とす", () => {
    expect(
      parseClientCommand({
        type: "set-session-default",
        commandId: "c-1",
        model: "no-such-model",
        effort: "medium",
        permissionMode: "auto",
      }),
    ).toBeUndefined()
  })

  it("知らない effort は落とす", () => {
    expect(
      parseClientCommand({
        type: "set-session-default",
        commandId: "c-1",
        model: "sonnet",
        effort: "no-such-effort",
        permissionMode: "auto",
      }),
    ).toBeUndefined()
  })

  it("effort が無いときは落とす（3つで1組）", () => {
    expect(
      parseClientCommand({
        type: "set-session-default",
        commandId: "c-1",
        model: "sonnet",
        permissionMode: "auto",
      }),
    ).toBeUndefined()
  })
})
