import { describe, expect, it } from "bun:test"

import { parseClientCommand, PERMISSION_MODES } from "../../src/shared/command.ts"
import {
  BUILTIN_SESSION_DEFAULT,
  isSessionDefaultPermissionMode,
  SESSION_DEFAULT_PERMISSION_MODES,
} from "../../src/shared/session-default.ts"

// 新しいセッションの既定（docs/requirements.md 4.1 / docs/design.md 13.6）。
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

  it("同梱の既定は Opus と auto", () => {
    expect(BUILTIN_SESSION_DEFAULT).toEqual({ model: "opus", permissionMode: "auto" })
  })
})

describe("set-session-default コマンド", () => {
  it("モデルと許可モードの組を受け付ける", () => {
    expect(
      parseClientCommand({
        type: "set-session-default",
        commandId: "c-1",
        model: "sonnet",
        permissionMode: "plan",
      }),
    ).toEqual({
      type: "set-session-default",
      commandId: "c-1",
      model: "sonnet",
      permissionMode: "plan",
    })
  })

  it("「全部許す」は境界で落とす（画面に選択肢が無いだけにしない）", () => {
    expect(
      parseClientCommand({
        type: "set-session-default",
        commandId: "c-1",
        model: "sonnet",
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
        permissionMode: "auto",
      }),
    ).toBeUndefined()
  })
})
