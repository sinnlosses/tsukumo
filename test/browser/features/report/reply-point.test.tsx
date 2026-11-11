// 字を選び終えたときの行き先（単位の中なら余白の口と引用つきの欄、単位の外なら入力欄へ引用を入れる口）。位置と見た目は目視と E2E で確かめる。

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { type ReactElement, useRef } from "react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, type Mock, vi } from "vitest"

import {
  LeafIdentityContext,
  SectionPointContext,
} from "../../../../src/browser/features/report/leaf-point-context.ts"
import { FoldedLeafFrame } from "../../../../src/browser/features/report/leaf/report-leaf-frame.tsx"
import { loadMarkdown } from "../../../../src/browser/features/report/markdown.tsx"
import { ReplyPointScope } from "../../../../src/browser/features/report/reply-point.tsx"
import {
  type ReplyPort,
  ReplyPortContext,
} from "../../../../src/browser/features/report/reply-port.ts"
import { useReplyNotes } from "../../../../src/browser/stores/reply-note-list.ts"

const PORT_NAME = "聞く・頼む"

beforeAll(async () => {
  await loadMarkdown()
})

beforeEach(() => {
  // happy-dom は描画しないので、範囲の矩形は空になる。位置を決める矩形だけ差し替える。
  Reflect.set(Object.getPrototypeOf(document.createRange()), "getClientRects", () => [
    { left: 40, right: 120, top: 80, bottom: 100 },
  ])
})

afterEach(() => {
  cleanup()
  document.getSelection()?.removeAllRanges()
  useReplyNotes.setState(useReplyNotes.getInitialState(), true)
})

function Report(): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null)
  return (
    <div data-report-body="" ref={rootRef}>
      <ReplyPointScope rootRef={rootRef}>
        <p>架空の頭の欄</p>
        <SectionPointContext
          value={{ kind: "section", reportToolUseId: "toolu_1", heading: "架空の節" }}
        >
          <LeafIdentityContext
            value={{ kind: "leaf", componentId: "p1", componentKind: "Paragraph" }}
          >
            <div data-report-region="section">
              <FoldedLeafFrame
                value={{ captionNumber: { kind: "none" }, gutterNotes: [] }}
                title="架空の題"
                fit={false}
                fold=""
                swap={false}
              >
                <p>架空の本体</p>
              </FoldedLeafFrame>
            </div>
          </LeafIdentityContext>
        </SectionPointContext>
      </ReplyPointScope>
    </div>
  )
}

function renderReport(): { readonly prependDraft: Mock<ReplyPort["prependDraft"]> } {
  const prependDraft = vi.fn<ReplyPort["prependDraft"]>()
  render(
    <ReplyPortContext
      value={{
        kind: "open",
        port: {
          ask: vi.fn<ReplyPort["ask"]>(),
          appendDraft: vi.fn<ReplyPort["appendDraft"]>(),
          prependDraft,
        },
      }}
    >
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

function textbox(): HTMLTextAreaElement {
  const box = screen.getByRole("textbox")
  if (!(box instanceof HTMLTextAreaElement)) {
    throw new Error("欄が textarea ではない")
  }
  return box
}

describe("単位の中で選んだ字", () => {
  it("余白の口から開いた欄の書き始めに、選んだ字の引用が入る", () => {
    renderReport()
    selectText("架空の本体")
    fireEvent.click(screen.getByRole("button", { name: PORT_NAME }))
    expect(textbox().value).toBe("> 架空の本体\n\n")
  })

  it("⌘⌥M でも同じ欄が開く", () => {
    renderReport()
    selectText("架空の本体")
    act(() => {
      fireEvent.keyDown(document, { key: "µ", code: "KeyM", metaKey: true, altKey: true })
    })
    expect(textbox().value).toBe("> 架空の本体\n\n")
  })
})

describe("単位の外で選んだ字", () => {
  it("口を押すと入力欄の頭へ引用を渡し、口が消える", () => {
    const { prependDraft } = renderReport()
    selectText("架空の頭の欄")
    fireEvent.click(screen.getByRole("button", { name: PORT_NAME }))
    expect(prependDraft).toHaveBeenCalledWith("> 架空の頭の欄")
    expect(screen.queryByRole("button", { name: PORT_NAME })).toBeNull()
  })

  it("Esc で口が消える", () => {
    renderReport()
    selectText("架空の頭の欄")
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" })
    })
    expect(screen.queryByRole("button", { name: PORT_NAME })).toBeNull()
  })
})
