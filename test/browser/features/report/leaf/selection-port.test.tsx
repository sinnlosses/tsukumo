// レポートの本文で選んだ字を入力欄の頭へ引く口。位置と見た目は目視と E2E で確かめる。

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { type ReactElement, useRef } from "react"
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest"

import { SelectionPort } from "../../../../../src/browser/features/report/leaf/selection-port.tsx"
import {
  type ReplyPort,
  ReplyPortContext,
  type ReplyPortSlot,
} from "../../../../../src/browser/features/report/reply-port.ts"

const PORT_NAME = "引いて聞く"

beforeEach(() => {
  // happy-dom は描画しないので、範囲の矩形は空になる。位置を決める矩形だけ差し替える。
  Reflect.set(Object.getPrototypeOf(document.createRange()), "getClientRects", () => [
    { left: 40, right: 120, top: 80, bottom: 100 },
  ])
})

afterEach(() => {
  cleanup()
  document.getSelection()?.removeAllRanges()
})

function Report(): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null)
  return (
    <>
      <div data-report-body="" ref={rootRef}>
        <p>架空の頭の欄</p>
        <div data-report-region="section">
          <p>架空の本体</p>
        </div>
        <SelectionPort rootRef={rootRef} />
      </div>
      <p>架空の本文の外</p>
    </>
  )
}

function renderReport(slot: "open" | "none"): {
  readonly prependDraft: Mock<ReplyPort["prependDraft"]>
} {
  const prependDraft = vi.fn<ReplyPort["prependDraft"]>()
  const value: ReplyPortSlot =
    slot === "open"
      ? { kind: "open", port: { appendDraft: vi.fn<ReplyPort["appendDraft"]>(), prependDraft } }
      : { kind: "none" }
  render(
    <ReplyPortContext value={value}>
      <Report />
    </ReplyPortContext>,
  )
  return { prependDraft }
}

function selectText(text: string): void {
  const node = screen.getByText(text).firstChild
  if (node === null) {
    throw new Error("フィクスチャの字が描かれていない")
  }
  const range = document.createRange()
  range.selectNodeContents(node)
  const selection = document.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  act(() => {
    fireEvent.pointerUp(document.body)
  })
}

describe("本文で選んだ字を引く口", () => {
  it("欄の中で選んだ字も、口を押すと入力欄の頭へ引用を渡し、口が消える", () => {
    const { prependDraft } = renderReport("open")
    selectText("架空の本体")
    fireEvent.click(screen.getByRole("button", { name: PORT_NAME }))
    expect(prependDraft).toHaveBeenCalledWith("> 架空の本体")
    expect(screen.queryByRole("button", { name: PORT_NAME })).toBeNull()
  })

  it("Esc で口が消える", () => {
    renderReport("open")
    selectText("架空の頭の欄")
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" })
    })
    expect(screen.queryByRole("button", { name: PORT_NAME })).toBeNull()
  })

  it("本文の外で選んだ字には口を出さない", () => {
    renderReport("open")
    selectText("架空の本文の外")
    expect(screen.queryByRole("button", { name: PORT_NAME })).toBeNull()
  })

  it("口が渡されていない描画では、選んでも口を出さない", () => {
    renderReport("none")
    selectText("架空の本体")
    expect(screen.queryByRole("button", { name: PORT_NAME })).toBeNull()
  })
})
