import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { SettingsScreen } from "../../../../../src/browser/components/frame/screen-nav/settings-screen.tsx"
import type { FigurePreference } from "../../../../../src/shared/session/session-default.ts"
import { INITIAL_SESSION_STATE } from "../../../../../src/shared/session/session-state.ts"
import { typedElement } from "../../../../typed-element.ts"
import { queryClientWrapper } from "../../../query-client.tsx"
import { stubRpcFetch, type RpcFetchStub } from "../../../rpc-fetch-stub.ts"
import { putSession } from "../../../session-store.ts"

// 設定の「セッションの既定」の面の、図の既定（`figurePreference`）の行。

let rpcStub: RpcFetchStub | undefined

afterEach(() => {
  cleanup()
  rpcStub?.restore()
  rpcStub = undefined
})

function renderWith(figurePreference: FigurePreference, sent: unknown[]): void {
  rpcStub = stubRpcFetch(() => ({ kind: "pending" }))
  putSession(
    {
      ...INITIAL_SESSION_STATE,
      sessionDefault: { model: "opus", effort: "high", permissionMode: "plan", figurePreference },
    },
    (command) => sent.push(command),
  )
  render(<SettingsScreen />, { wrapper: queryClientWrapper() })
}

function figureSelect(): HTMLSelectElement {
  return typedElement(
    screen.getByLabelText("新しいセッションの図の既定"),
    HTMLSelectElement,
    "図の既定の select",
  )
}

describe("設定の紙（新しいセッションの図の既定）", () => {
  it("選ぶと、いまのモデル・effort・許可モードと一緒に session.setSessionDefault を送る", () => {
    const sent: unknown[] = []
    renderWith("chart", sent)
    const select = figureSelect()
    expect(select.value).toBe("chart")

    fireEvent.change(select, { target: { value: "text" } })

    expect(sent).toEqual([
      {
        procedure: "session.setSessionDefault",
        model: "opus",
        effort: "high",
        permissionMode: "plan",
        figurePreference: "text",
      },
    ])
  })

  it("届いた図の既定をそのまま出し、知らない値は送らない", () => {
    const sent: unknown[] = []
    renderWith("text", sent)
    const select = figureSelect()

    expect(select.value).toBe("text")
    fireEvent.change(select, { target: { value: "no-such" } })

    expect(sent).toEqual([])
  })
})
