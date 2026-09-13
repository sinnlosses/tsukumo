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

function selectValue(element: HTMLElement): string {
  return (element as HTMLSelectElement).value
}

describe("SessionInfo", () => {
  it("状態の model / permissionMode の値を <select> に選択する", () => {
    renderSessionInfo({ model: "claude-sonnet-5", permissionMode: "plan" })

    expect(selectValue(screen.getByLabelText("モデル"))).toBe("sonnet")
    expect(selectValue(screen.getByLabelText("許可モード"))).toBe("plan")
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
