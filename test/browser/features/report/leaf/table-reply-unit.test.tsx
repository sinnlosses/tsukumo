import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { AskThreadContext } from "../../../../../src/browser/features/report/ask-thread-context.ts"
import {
  askLeafKey,
  type LeafAskThread,
} from "../../../../../src/browser/features/report/domain/ask-thread.ts"
import { loadMarkdown } from "../../../../../src/browser/features/report/markdown.tsx"
import {
  type ReplyPort,
  ReplyPortContext,
  type ReplyPortSlot,
} from "../../../../../src/browser/features/report/reply-port.ts"
import { Report } from "../../../../../src/browser/features/report/report.tsx"
import { useReplyNotes } from "../../../../../src/browser/stores/reply-note-list.ts"
import { INTERACTIVE, regionsOf, reportParts, ROWS } from "../../../../fixture/table-report-part.ts"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

function renderAskable(options: { readonly port: boolean; readonly reportToolUseId?: string }) {
  const ask = vi.fn<ReplyPort["ask"]>()
  const slot: ReplyPortSlot = options.port
    ? {
        kind: "open",
        port: {
          appendDraft: vi.fn<ReplyPort["appendDraft"]>(),
          prependDraft: vi.fn<ReplyPort["prependDraft"]>(),
          ask,
        },
      }
    : { kind: "none" }
  const body = regionsOf(reportParts(INTERACTIVE, false))
  const view = render(
    <ReplyPortContext value={slot}>
      <Report
        reveal={false}
        turnId={1}
        className=""
        revealClassName=""
        blockClassName=""
        body={body}
        reportToolUseId={options.reportToolUseId}
      />
    </ReplyPortContext>,
  )
  return { ask, ...view }
}

function askButtonCount(): number {
  return screen.queryAllByRole("button", { name: /聞く|頼む/ }).length
}

/** 行の1列目の字を押して行を指し、余白の「聞く・頼む」で欄を開く。 */
function openRow(firstCell: string): void {
  fireEvent.click(screen.getByText(firstCell))
  fireEvent.click(screen.getByRole("button", { name: "聞く・頼む" }))
}

describe("表の行の「聞く・頼む」", () => {
  it("何も押していないときは「聞く」「頼む」のボタンが無く、行を押すと「聞く・頼む」が1つ出て行に印が付く", () => {
    const { container } = renderAskable({ port: true, reportToolUseId: "toolu_1" })
    expect(askButtonCount()).toBe(0)
    expect(container.querySelectorAll("thead th")).toHaveLength(3)

    fireEvent.click(screen.getByText("あ"))

    expect(askButtonCount()).toBe(1)
    expect(container.querySelectorAll("tbody tr[data-pointed]")).toHaveLength(1)
    expect(container.querySelector("tbody tr[data-pointed]")?.firstElementChild?.textContent).toBe(
      "あ",
    )
  })

  it("別の行を押すと指す行が移り、「聞く・頼む」は1つのまま", () => {
    const { container } = renderAskable({ port: true, reportToolUseId: "toolu_1" })

    fireEvent.click(screen.getByText("あ"))
    fireEvent.click(screen.getByText("ん"))

    expect(askButtonCount()).toBe(1)
    expect(container.querySelector("tbody tr[data-pointed]")?.firstElementChild?.textContent).toBe(
      "ん",
    )
  })

  it("行の欄を頼むに切り替えて送ると付箋が増えて ask は呼ばれない", () => {
    const { ask } = renderAskable({ port: true, reportToolUseId: "toolu_1" })

    openRow("あ")
    fireEvent.click(screen.getByRole("radio", { name: "頼む" }))
    const field = screen.getByRole("textbox")
    fireEvent.change(field, { target: { value: "この行を直して" } })
    fireEvent.keyDown(field, { key: "Enter", metaKey: true })

    const notes = Object.values(useReplyNotes.getState().notesBySession).flat()
    expect(notes).toHaveLength(1)
    expect(notes[0]?.target.key).toEqual({
      reportToolUseId: "toolu_1",
      componentId: "t1",
      rowIndex: 1,
    })
    expect(ask).not.toHaveBeenCalled()
    useReplyNotes.setState(useReplyNotes.getInitialState(), true)
  })

  it("口が無いか、report の id が無ければ行を押しても出ない", () => {
    renderAskable({ port: false, reportToolUseId: "toolu_1" })
    fireEvent.click(screen.getByText("あ"))
    expect(askButtonCount()).toBe(0)
    cleanup()

    renderAskable({ port: true })
    fireEvent.click(screen.getByText("あ"))
    expect(askButtonCount()).toBe(0)
  })

  it("並べ替えたあとの行を押しても、行の添字は書いた並びのまま届き、1列目の字が label.row に入る", () => {
    const { ask } = renderAskable({ port: true, reportToolUseId: "toolu_1" })

    fireEvent.click(screen.getByRole("button", { name: /架空の数/ }))
    openRow("あ")
    const field = screen.getByRole("textbox")
    fireEvent.change(field, { target: { value: "なぜ？" } })
    fireEvent.keyDown(field, { key: "Enter", metaKey: true })

    expect(ask).toHaveBeenCalledExactlyOnceWith(
      {
        label: { section: "架空の操作", component: "架空の表", row: "あ" },
        key: { reportToolUseId: "toolu_1", componentId: "t1", rowIndex: 1 },
      },
      "なぜ？",
    )
  })

  it("入力欄は表の中で1つだけ開く（部品全体の欄と行の欄が取り合う）", () => {
    renderAskable({ port: true, reportToolUseId: "toolu_1" })

    openRow("架空の表")
    expect(screen.getAllByRole("textbox")).toHaveLength(1)
    openRow("ぼ")

    expect(screen.getAllByRole("textbox")).toHaveLength(1)
    expect(screen.getByText(/指した所: .* › ぼ$/)).toBeTruthy()
  })

  it("行の欄は余白の札に開き、表は割れず、指した行に印が付く", () => {
    const { container } = renderAskable({ port: true, reportToolUseId: "toolu_1" })

    openRow("ぼ")

    const field = screen.getByRole("textbox")
    const table = container.querySelector("table")
    expect(table?.contains(field)).toBe(false)
    expect(field.closest('[class*="ask-margin"]')).not.toBeNull()
    expect(container.querySelector('[class*="ask-main"]')?.contains(field)).toBe(false)
    expect(container.querySelectorAll("tbody tr[class*='ask-row-active']")).toHaveLength(1)
  })
})

describe("表の行をキーボードで指して開く", () => {
  function focused(): Element {
    if (document.activeElement === null) throw new Error("フォーカスが無い")
    return document.activeElement
  }

  it("Tab の止まり場は表で1つ（題の行）で、↓ で次の行へ動くと行を指して「聞く・頼む」が出る", () => {
    const { container } = renderAskable({ port: true, reportToolUseId: "toolu_1" })
    const stops = container.querySelectorAll<HTMLElement>("[data-reply-unit][tabindex='0']")
    expect(stops).toHaveLength(1)
    expect(stops[0]?.textContent).toContain("架空の表")
    expect(container.querySelectorAll("tbody tr[tabindex='-1']")).toHaveLength(ROWS.length)

    act(() => {
      stops[0]?.focus()
    })
    fireEvent.keyDown(focused(), { key: "ArrowDown" })

    expect(focused().firstElementChild?.textContent).toBe("ぼ")
    expect(focused().getAttribute("data-pointed")).toBe("")
    expect(focused().getAttribute("tabindex")).toBe("0")
    expect(container.querySelectorAll("[data-reply-unit][tabindex='0']")).toHaveLength(1)
    expect(askButtonCount()).toBe(1)
  })

  it("Enter で欄が開き、Esc で閉じてフォーカスが行へ戻り、⌘⌥M でも開く", () => {
    const { container } = renderAskable({ port: true, reportToolUseId: "toolu_1" })
    const row = container.querySelector<HTMLElement>("tbody tr[data-reply-row='1']")
    if (row === null) throw new Error("行が無い")

    act(() => {
      row.focus()
    })
    fireEvent.keyDown(row, { key: "Enter" })
    expect(screen.getByText(/指した所: .* › あ$/)).toBeTruthy()

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" })
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(focused()).toBe(row)

    fireEvent.keyDown(row, { key: "µ", code: "KeyM", metaKey: true, altKey: true })
    expect(screen.getByRole("textbox")).toBeTruthy()
  })
})

describe("表の行に聞いた印", () => {
  it("聞いた行にだけ印の線が付き、その行の対が表の下に出る", () => {
    const thread: LeafAskThread = {
      pairs: [
        {
          question: "なぜ？",
          answer: { kind: "answered", text: "架空の理由。" },
          row: { index: 1, label: "あ" },
        },
      ],
      waiting: false,
      count: 1,
    }
    const body = regionsOf(reportParts(INTERACTIVE, false))
    const { container } = render(
      <ReplyPortContext
        value={{
          kind: "open",
          port: {
            appendDraft: vi.fn<ReplyPort["appendDraft"]>(),
            prependDraft: vi.fn<ReplyPort["prependDraft"]>(),
            ask: vi.fn<ReplyPort["ask"]>(),
          },
        }}
      >
        <AskThreadContext
          value={{
            kind: "grouped",
            byLeaf: new Map([[askLeafKey("toolu_1", "t1"), thread]]),
            remaining: [],
          }}
        >
          <Report
            reveal={false}
            turnId={1}
            className=""
            revealClassName=""
            blockClassName=""
            body={body}
            reportToolUseId="toolu_1"
          />
        </AskThreadContext>
      </ReplyPortContext>,
    )

    const marked = [...container.querySelectorAll("tbody tr")].filter((row) =>
      row.textContent.includes("聞 1"),
    )
    expect(marked).toHaveLength(1)
    expect(marked[0]?.firstElementChild?.textContent).toContain("あ")
    expect(screen.getByText("なぜ？")).toBeTruthy()
    expect(container.textContent).not.toContain("答えた")
  })
})
