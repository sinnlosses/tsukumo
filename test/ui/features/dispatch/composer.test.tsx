import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { type CharacterInfo } from "../../../../src/protocol/character.ts"
import { INITIAL_SESSION_STATE, type SessionState } from "../../../../src/protocol/session-state.ts"
import { Composer } from "../../../../src/ui/features/dispatch/composer.tsx"
import { SessionContext, type SessionContextValue } from "../../../../src/ui/stores/session.tsx"

// フィクスチャはすべて手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。
const FIXTURE_CHARACTER: CharacterInfo = {
  pack: "架空パック",
  name: "架空の名前",
  accent: undefined,
  expressions: [],
  portraits: { default: undefined, working: undefined, proud: undefined, flustered: undefined },
  outfitAccents: { default: undefined, light: undefined, normal: undefined, heavy: undefined },
  speechMarker: undefined,
  workingSpeech: undefined,
  editable: false,
}

afterEach(() => {
  cleanup()
})

function renderComposer(
  stateOverrides: Partial<SessionState> = {},
  dispatch: SessionContextValue["dispatch"] = () => {},
): void {
  const value: SessionContextValue = {
    state: { ...INITIAL_SESSION_STATE, ...stateOverrides },
    connection: "open",
    dispatch,
  }
  render(
    <SessionContext.Provider value={value}>
      <Composer />
    </SessionContext.Provider>,
  )
}

function textArea(): HTMLTextAreaElement {
  return screen.getByPlaceholderText(/依頼を書く/) as HTMLTextAreaElement
}

describe("Composer", () => {
  it("(1) Command+Enter で prompt が dispatch され、入力欄が空になる", () => {
    const calls: unknown[] = []
    renderComposer({}, (command) => calls.push(command))

    fireEvent.change(textArea(), { target: { value: "架空の依頼" } })
    fireEvent.keyDown(textArea(), { key: "Enter", metaKey: true })

    expect(calls).toEqual([{ type: "prompt", text: "架空の依頼" }])
    expect(textArea().value).toBe("")
  })

  it("(2) Enter 単独・Shift+Enter は送らない（既定の改行のまま）", () => {
    const calls: unknown[] = []
    renderComposer({}, (command) => calls.push(command))

    fireEvent.change(textArea(), { target: { value: "架空の依頼" } })
    fireEvent.keyDown(textArea(), { key: "Enter" })
    fireEvent.keyDown(textArea(), { key: "Enter", shiftKey: true })

    expect(calls).toEqual([])
    expect(textArea().value).toBe("架空の依頼")
  })

  it("(3) IME の変換確定中の Command+Enter は送らない（isComposing）", () => {
    const calls: unknown[] = []
    renderComposer({}, (command) => calls.push(command))

    fireEvent.change(textArea(), { target: { value: "架空の依頼" } })
    fireEvent.keyDown(textArea(), { key: "Enter", metaKey: true, isComposing: true })

    expect(calls).toEqual([])
    expect(textArea().value).toBe("架空の依頼")
  })

  it("(3) 古いブラウザ向けの keyCode 229（IME 変換確定）でも送らない", () => {
    const calls: unknown[] = []
    renderComposer({}, (command) => calls.push(command))

    fireEvent.change(textArea(), { target: { value: "架空の依頼" } })
    fireEvent.keyDown(textArea(), { key: "Enter", metaKey: true, keyCode: 229 })

    expect(calls).toEqual([])
  })

  it("turnInProgress の間に Command+Enter を押しても送らない（進行中は中断ボタンに切り替わる）", () => {
    const calls: unknown[] = []
    renderComposer({ turnInProgress: true }, (command) => calls.push(command))

    fireEvent.change(textArea(), { target: { value: "架空の依頼" } })
    fireEvent.keyDown(textArea(), { key: "Enter", metaKey: true })

    expect(calls).toEqual([])
  })

  it("(6) / で候補が前方一致→部分一致の順に出て、Tab で確定し送信しない", () => {
    const calls: unknown[] = []
    renderComposer(
      {
        slashCommands: ["clear", "compact", "unclear"],
        commandDescriptions: [
          { name: "clear", description: "架空の説明（消す）" },
          { name: "compact", description: "架空の説明（まとめる）" },
          { name: "unclear", description: undefined },
        ],
      },
      (command) => calls.push(command),
    )

    fireEvent.change(textArea(), { target: { value: "/cl" } })

    // "cl" は clear が前方一致、unclear が部分一致（"cl" を含む）。
    const items = screen.getAllByRole("listitem")
    expect(items.map((item) => item.textContent)).toEqual(["/clear架空の説明（消す）", "/unclear"])

    fireEvent.keyDown(textArea(), { key: "Tab" })

    expect(textArea().value).toBe("/clear ")
    expect(calls).toEqual([])
  })

  it("(6) 候補は最大10件に絞る", () => {
    const commandDescriptions = Array.from({ length: 15 }, (_, index) => ({
      name: `cmd${String(index).padStart(2, "0")}`,
      description: undefined,
    }))
    renderComposer({ slashCommands: commandDescriptions.map((c) => c.name), commandDescriptions })

    fireEvent.change(textArea(), { target: { value: "/cmd" } })

    expect(screen.getAllByRole("listitem")).toHaveLength(10)
  })

  it("答え待ちがある間は候補を出さない", () => {
    renderComposer({
      slashCommands: ["clear"],
      commandDescriptions: [{ name: "clear", description: undefined }],
      pending: [{ kind: "permission", id: "ask-1", toolName: "Bash", input: {} }],
    })

    fireEvent.change(textArea(), { target: { value: "/cl" } })

    expect(screen.queryAllByRole("listitem")).toHaveLength(0)
  })

  it("(6) 候補が出ている間は Ctrl+N / Ctrl+P で選択が上下に動く（Meta 併用は無視）", () => {
    renderComposer({
      slashCommands: ["alpha", "beta"],
      commandDescriptions: [
        { name: "alpha", description: undefined },
        { name: "beta", description: undefined },
      ],
    })

    fireEvent.change(textArea(), { target: { value: "/" } })

    const selected = (): string | undefined =>
      screen.getAllByRole("listitem").find((item) => item.className.includes("is-selected"))
        ?.textContent

    expect(selected()).toBe("/alpha")

    const forward = fireEvent.keyDown(textArea(), { key: "n", ctrlKey: true })
    expect(forward).toBe(false) // preventDefault が呼ばれた
    expect(selected()).toBe("/beta")

    // Meta（Command）と組み合わせたときは反応しない。
    const withMeta = fireEvent.keyDown(textArea(), { key: "n", ctrlKey: true, metaKey: true })
    expect(withMeta).toBe(true) // preventDefault は呼ばれない
    expect(selected()).toBe("/beta")

    const backward = fireEvent.keyDown(textArea(), { key: "p", ctrlKey: true })
    expect(backward).toBe(false)
    expect(selected()).toBe("/alpha")
  })

  it("候補が出ていないときは Ctrl+N / Ctrl+P は何もしない（preventDefault も呼ばない）", () => {
    const calls: unknown[] = []
    renderComposer({}, (command) => calls.push(command))

    fireEvent.change(textArea(), { target: { value: "架空の依頼" } })

    const forward = fireEvent.keyDown(textArea(), { key: "n", ctrlKey: true })
    const backward = fireEvent.keyDown(textArea(), { key: "p", ctrlKey: true })

    expect(forward).toBe(true) // preventDefault は呼ばれない
    expect(backward).toBe(true)
    expect(calls).toEqual([])
    expect(textArea().value).toBe("架空の依頼")
  })

  it("キャラクターの名前があるときは、プレースホルダにその名前が出る", () => {
    renderComposer({ character: FIXTURE_CHARACTER })

    expect(textArea().placeholder).toBe(
      "架空の名前への依頼を書く（Enter で改行、Command+Enter で送信、/ でコマンド補完）",
    )
  })

  it("キャラクターがまだ届いていない・名前が無いときは、名前を使わない言い方に落ちる", () => {
    renderComposer({ character: undefined })

    expect(textArea().placeholder).toBe(
      "依頼を書く（Enter で改行、Command+Enter で送信、/ でコマンド補完）",
    )
  })
})
