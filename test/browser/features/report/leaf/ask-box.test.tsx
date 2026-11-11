import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { replyTargetOf } from "../../../../../src/browser/features/report/domain/reply-target.ts"
import { AskBox } from "../../../../../src/browser/features/report/leaf/ask-box.tsx"

afterEach(() => {
  cleanup()
})

const TARGET = replyTargetOf({
  reportToolUseId: "toolu_1",
  componentId: "tbl",
  section: "架空の節",
  title: "架空の表",
  componentKind: "Table",
  row: { index: 2, firstCell: "架空の行" },
})

function open(mode: "ask" | "request" = "ask", initialText = "", requestText = "") {
  const onSend = vi.fn<(text: string) => void>()
  const onNote = vi.fn<(text: string) => void>()
  const onClose = vi.fn<() => void>()
  render(
    <AskBox
      target={TARGET}
      initialMode={mode}
      initialText={initialText}
      requestText={requestText}
      onSend={onSend}
      onNote={onNote}
      onClose={onClose}
    />,
  )
  return { onSend, onNote, onClose, field: screen.getByRole("textbox") }
}

describe("AskBox", () => {
  it("指した所の行と案内を出し、開いたとき入力欄へフォーカスする", () => {
    const { field } = open()

    expect(screen.getByText(/指した所: 架空の節 › 架空の表 › 架空の行/)).toBeTruthy()
    expect(screen.getByText("答えはこの下に返る。作業は始めない")).toBeTruthy()
    expect(document.activeElement).toBe(field)
  })

  it("⌘⏎ で指した所つきの問いを送って閉じる", () => {
    const { onSend, onClose, field } = open()

    fireEvent.change(field, { target: { value: "なぜ遅いの？" } })
    fireEvent.keyDown(field, { key: "Enter", metaKey: true })

    expect(onSend).toHaveBeenCalledExactlyOnceWith("なぜ遅いの？")
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("Esc と「やめる」で送らずに閉じる", () => {
    const { onSend, onClose, field } = open()

    fireEvent.keyDown(field, { key: "Escape" })
    fireEvent.click(screen.getByRole("button", { name: "やめる" }))

    expect(onClose).toHaveBeenCalledTimes(2)
    expect(onSend).not.toHaveBeenCalled()
  })

  it("空では送れない", () => {
    const { onSend, field } = open()

    fireEvent.change(field, { target: { value: "  " } })
    fireEvent.keyDown(field, { key: "Enter", metaKey: true })

    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: /^聞く/ }).getAttribute("aria-disabled")).toBe("true")
  })

  it("頼むに切り替えると案内と送るボタンの字が変わる", () => {
    open()

    fireEvent.click(screen.getByRole("radio", { name: "頼む" }))

    expect(screen.getByText("付箋にして、あとでまとめて頼む")).toBeTruthy()
    expect(screen.getByRole("button", { name: "付箋にする ⌘⏎" })).toBeTruthy()
    expect(screen.queryByText("答えはこの下に返る。作業は始めない")).toBeNull()
  })

  it("頼むで ⌘⏎ すると onNote を呼び、会話への onSend は呼ばない", () => {
    const { onSend, onNote, onClose, field } = open("request", "下書き")

    expect(screen.getByDisplayValue("下書き")).toBe(field)
    fireEvent.keyDown(field, { key: "Enter", metaKey: true })

    expect(onNote).toHaveBeenCalledExactlyOnceWith("下書き")
    expect(onSend).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
