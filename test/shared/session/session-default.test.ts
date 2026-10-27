import { describe, expect, it } from "vitest"

import { sessionContract } from "../../../src/shared/contract/session.ts"
import {
  isSessionDefaultPermissionMode,
  SESSION_DEFAULT_PERMISSION_MODES,
} from "../../../src/shared/session/session-default.ts"

// 新しいセッションの既定
// （docs/requirements/claude-code-driving.md「モデルと許可モードの既定は、画面（帯の右端の歯車）から変えて覚えさせられる」
// / docs/architecture/screen-design.md「設定の置き場所」）。
describe("既定に選べる許可モード", () => {
  it("「全部許す」（bypassPermissions）だけを落とした一覧になっている", () => {
    expect([...SESSION_DEFAULT_PERMISSION_MODES]).toEqual([
      "default",
      "acceptEdits",
      "auto",
      "plan",
    ])
  })

  it("「全部許す」は既定として受け付けない", () => {
    expect(isSessionDefaultPermissionMode("bypassPermissions")).toBe(false)
    expect(isSessionDefaultPermissionMode("plan")).toBe(true)
    expect(isSessionDefaultPermissionMode("no-such-mode")).toBe(false)
  })
})

/** `session.setSessionDefault` の入力として検証する（通らなければ undefined）。 */
function parseSessionDefault(value: unknown): unknown {
  const parsed = sessionContract.setSessionDefault["~orpc"].inputSchema?.safeParse(value)
  return parsed?.success === true ? parsed.data : undefined
}

describe("session.setSessionDefault コマンド", () => {
  it("モデル・effort・許可モード・図の既定の組を受け付ける", () => {
    expect(
      parseSessionDefault({
        model: "sonnet",
        effort: "high",
        permissionMode: "plan",
        figurePreference: "text",
      }),
    ).toEqual({
      model: "sonnet",
      effort: "high",
      permissionMode: "plan",
      figurePreference: "text",
    })
  })

  it("「全部許す」は境界で落とす（画面に選択肢が無いだけにしない）", () => {
    expect(
      parseSessionDefault({
        model: "sonnet",
        effort: "medium",
        permissionMode: "bypassPermissions",
        figurePreference: "chart",
      }),
    ).toBeUndefined()
  })

  it.each([
    [
      "知らないモデル名",
      {
        model: "no-such-model",
        effort: "medium",
        permissionMode: "auto",
        figurePreference: "chart",
      },
    ],
    [
      "知らない effort",
      {
        model: "sonnet",
        effort: "no-such-effort",
        permissionMode: "auto",
        figurePreference: "chart",
      },
    ],
    [
      "知らない figurePreference",
      { model: "sonnet", effort: "medium", permissionMode: "auto", figurePreference: "no-such" },
    ],
  ])("%s は落とす", (_name, value) => {
    expect(parseSessionDefault(value)).toBeUndefined()
  })

  it("effort が無いときは落とす（4つで1組）", () => {
    expect(
      parseSessionDefault({
        model: "sonnet",
        permissionMode: "auto",
        figurePreference: "chart",
      }),
    ).toBeUndefined()
  })

  it("figurePreference が無いときは落とす（4つで1組）", () => {
    expect(
      parseSessionDefault({ model: "sonnet", effort: "medium", permissionMode: "auto" }),
    ).toBeUndefined()
  })
})
