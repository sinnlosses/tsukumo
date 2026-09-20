import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { SessionInfo } from "../../../../src/browser/features/sidebar/session-info.tsx"
import {
  SessionContext,
  type SessionContextValue,
} from "../../../../src/browser/stores/session.tsx"
import { MODEL_ALIASES } from "../../../../src/shared/command.ts"
import { INITIAL_SESSION_STATE, type SessionState } from "../../../../src/shared/session-state.ts"

afterEach(() => {
  cleanup()
})

/**
 * 本物の WebSocket 接続（`<App>`）を経由せず、`SessionContext` へ直接値を差し込んで描く
 * （`src/browser/stores/session.tsx` が部品のテスト用に Context 自体を公開している）。
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
  portraits: { default: undefined, thinking: undefined, proud: undefined, flustered: undefined },
  outfitAccents: { default: undefined, light: undefined, normal: undefined, heavy: undefined },
  editable: true,
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

  // キャラクター画面への入る口は**キャラクターの行**に置く（docs/design.md 13.6）。
  it("キャラクターの行に、キャラクター画面への「整える」を出す", () => {
    renderSessionInfo({
      characterPacks: [{ name: "tsukumo-spirit", label: "つくもの精霊" }],
      character: { ...FIXTURE_CHARACTER, pack: "tsukumo-spirit" },
    })

    expect(screen.getByRole("link", { name: "整える" }).getAttribute("href")).toBe("#character")
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

  it("ターン進行中はキャラクターの <select> が無効になり、理由が title に出る", () => {
    renderSessionInfo({
      turnInProgress: true,
      characterPacks: [{ name: "tsukumo-spirit", label: "つくもの精霊" }],
      character: { ...FIXTURE_CHARACTER, pack: "tsukumo-spirit" },
    })

    const select = screen.getByLabelText("キャラクター") as HTMLSelectElement
    expect(select.disabled).toBe(true)
    expect(select.title.length).toBeGreaterThan(0)
  })

  it("ターンが終わるとキャラクターの <select> は有効に戻る", () => {
    renderSessionInfo({
      turnInProgress: false,
      characterPacks: [{ name: "tsukumo-spirit", label: "つくもの精霊" }],
      character: { ...FIXTURE_CHARACTER, pack: "tsukumo-spirit" },
    })

    const select = screen.getByLabelText("キャラクター") as HTMLSelectElement
    expect(select.disabled).toBe(false)
    expect(select.title).toBe("")
  })

  it("ターン進行中でもモデル・許可モードの <select> は無効にしない（会話は消えないため）", () => {
    renderSessionInfo({ turnInProgress: true })

    expect((screen.getByLabelText("モデル") as HTMLSelectElement).disabled).toBe(false)
    expect((screen.getByLabelText("許可モード") as HTMLSelectElement).disabled).toBe(false)
  })

  it("パックの一覧が届いていなければ、キャラクターの <select> は出さない", () => {
    renderSessionInfo({})

    expect(screen.queryByLabelText("キャラクター")).toBeNull()
  })

  it("モデルの<select>の選択肢は MODEL_ALIASES と過不足なく一致する（片方だけの追加漏れを防ぐ）", () => {
    renderSessionInfo({})

    const select = screen.getByLabelText("モデル") as HTMLSelectElement
    const optionValues = Array.from(select.options).map((option) => option.value)

    expect([...optionValues].sort()).toEqual([...MODEL_ALIASES].sort())
  })

  it("model が fable を含むとき、モデルの<select>は fable を選択する", () => {
    renderSessionInfo({ model: "claude-fable-5-1" })

    expect(selectValue(screen.getByLabelText("モデル"))).toBe("fable")
  })

  it("model が opus のみを含むとき、fable を誤って選択しない", () => {
    renderSessionInfo({ model: "claude-opus-5" })

    expect(selectValue(screen.getByLabelText("モデル"))).toBe("opus")
  })

  it("model が sonnet / haiku のとき、fable を誤って選択しない", () => {
    renderSessionInfo({ model: "claude-sonnet-5" })
    expect(selectValue(screen.getByLabelText("モデル"))).toBe("sonnet")

    cleanup()
    renderSessionInfo({ model: "claude-haiku-5" })
    expect(selectValue(screen.getByLabelText("モデル"))).toBe("haiku")
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
