import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { INITIAL_SESSION_STATE, type SessionState } from "../../../src/protocol/session-state.ts"
import { SessionContext, type SessionContextValue } from "../../../src/ui/app.tsx"
import { SessionInfo } from "../../../src/ui/sidebar/session-info.tsx"

afterEach(() => {
  cleanup()
})

/**
 * 本物の WebSocket 接続（`<App>`）を経由せず、`SessionContext` へ直接値を差し込んで描く
 * （`src/ui/app.tsx` が部品のテスト用に Context 自体を公開している）。
 */
function renderSessionInfo(
  stateOverrides: Partial<SessionState>,
  dispatch: SessionContextValue["dispatch"] = () => {},
): void {
  const value: SessionContextValue = {
    state: { ...INITIAL_SESSION_STATE, ...stateOverrides },
    connection: "open",
    dispatch,
  }
  render(
    <SessionContext.Provider value={value}>
      <SessionInfo />
    </SessionContext.Provider>,
  )
}

// 手で書いた架空のキャラクター定義（docs/coding-standards.md「会話内容の扱い」）。
const FIXTURE_CHARACTER: NonNullable<SessionState["character"]> = {
  pack: undefined,
  name: "架空の精霊",
  accent: undefined,
  speechMarker: undefined,
  expressions: [{ name: "default", label: "通常" }],
  portraits: { default: undefined, working: undefined, proud: undefined, flustered: undefined },
  outfitAccents: { default: undefined, light: undefined, normal: undefined, heavy: undefined },
}

function selectValue(element: HTMLElement): string {
  return (element as HTMLSelectElement).value
}

describe("SessionInfo", () => {
  it("状態の model / permissionMode の値を <select> に選択する", () => {
    renderSessionInfo({ model: "claude-sonnet-5", permissionMode: "plan" })

    expect(selectValue(screen.getByLabelText("モデル"))).toBe("sonnet")
    expect(selectValue(screen.getByLabelText("許可モード"))).toBe("plan")
  })

  it("キャラクターの <select> は選択肢が1つでも出す", () => {
    renderSessionInfo({
      characterPacks: [{ name: "tsukumo-spirit", label: "つくもの精霊" }],
      character: { ...FIXTURE_CHARACTER, pack: "tsukumo-spirit" },
    })

    const select = screen.getByLabelText("キャラクター")
    expect(selectValue(select)).toBe("tsukumo-spirit")
    expect((select as HTMLSelectElement).options).toHaveLength(1)
  })

  it("キャラクターを変更すると switch-character が dispatch される", () => {
    const calls: unknown[] = []
    renderSessionInfo(
      {
        characterPacks: [
          { name: "tsukumo-spirit", label: "つくもの精霊" },
          { name: "local", label: "架空の同居人" },
        ],
        character: { ...FIXTURE_CHARACTER, pack: "tsukumo-spirit" },
      },
      (command) => {
        calls.push(command)
      },
    )

    fireEvent.change(screen.getByLabelText("キャラクター"), { target: { value: "local" } })

    expect(calls).toEqual([{ type: "switch-character", name: "local" }])
  })

  it("パックの一覧が届いていなければ、キャラクターの <select> は出さない", () => {
    renderSessionInfo({})

    expect(screen.queryByLabelText("キャラクター")).toBeNull()
  })

  it("モデルを変更すると set-model が dispatch される", () => {
    const calls: unknown[] = []
    renderSessionInfo({ model: "claude-sonnet-5" }, (command) => {
      calls.push(command)
    })

    fireEvent.change(screen.getByLabelText("モデル"), { target: { value: "opus" } })

    expect(calls).toEqual([{ type: "set-model", model: "opus" }])
  })

  it("許可モードを変更すると set-permission-mode が dispatch される", () => {
    const calls: unknown[] = []
    renderSessionInfo({ permissionMode: "auto" }, (command) => {
      calls.push(command)
    })

    fireEvent.change(screen.getByLabelText("許可モード"), { target: { value: "plan" } })

    expect(calls).toEqual([{ type: "set-permission-mode", mode: "plan" }])
  })

  it("続きから始まったときは「続きから」の印を出す", () => {
    renderSessionInfo({ restored: true })

    expect(screen.getByText("続きから")).toBeDefined()
  })

  it("新規に起きたセッションでは「続きから」の印を出さない", () => {
    renderSessionInfo({ restored: false })

    expect(screen.queryByText("続きから")).toBeNull()
  })

  it("bypassPermissions を選ぶと警告の見た目のクラスが付く", () => {
    renderSessionInfo({ permissionMode: "bypassPermissions" })

    expect(screen.getByLabelText("許可モード").className).toContain("permission-mode-select-danger")
  })

  it("bypassPermissions 以外では警告のクラスが付かない", () => {
    renderSessionInfo({ permissionMode: "auto" })

    expect(screen.getByLabelText("許可モード").className).not.toContain(
      "permission-mode-select-danger",
    )
  })
})
