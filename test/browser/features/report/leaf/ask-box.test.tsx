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

function open() {
  const onSend = vi.fn<(text: string) => void>()
  const onClose = vi.fn<() => void>()
  render(<AskBox target={TARGET} onSend={onSend} onClose={onClose} />)
  return { onSend, onClose, field: screen.getByRole("textbox") }
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
})
