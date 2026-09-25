import { describe, expect, it } from "bun:test"

import { PERMISSION_MODES } from "../../src/shared/command.ts"
import { sessionContract } from "../../src/shared/contract/session.ts"
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

/** `session.setSessionDefault` の入力として検証する（通らなければ undefined）。 */
function parseSessionDefault(value: unknown): unknown {
  const parsed = sessionContract.setSessionDefault["~orpc"].inputSchema?.safeParse(value)
  return parsed?.success === true ? parsed.data : undefined
}

describe("session.setSessionDefault コマンド", () => {
  it("モデル・effort・許可モードの組を受け付ける", () => {
    expect(
      parseSessionDefault({
        model: "sonnet",
        effort: "high",
        permissionMode: "plan",
      }),
    ).toEqual({
      model: "sonnet",
      effort: "high",
      permissionMode: "plan",
    })
  })

  it("「全部許す」は境界で落とす（画面に選択肢が無いだけにしない）", () => {
    expect(
      parseSessionDefault({
        model: "sonnet",
        effort: "medium",
        permissionMode: "bypassPermissions",
      }),
    ).toBeUndefined()
  })

  it("知らないモデル名は落とす", () => {
    expect(
      parseSessionDefault({
        model: "no-such-model",
        effort: "medium",
        permissionMode: "auto",
      }),
    ).toBeUndefined()
  })

  it("知らない effort は落とす", () => {
    expect(
      parseSessionDefault({
        model: "sonnet",
        effort: "no-such-effort",
        permissionMode: "auto",
      }),
    ).toBeUndefined()
  })

  it("effort が無いときは落とす（3つで1組）", () => {
    expect(
      parseSessionDefault({
        model: "sonnet",
        permissionMode: "auto",
      }),
    ).toBeUndefined()
  })
})
