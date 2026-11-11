import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createRef } from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import {
  type LeafIdentity,
  LeafIdentityContext,
  type SectionPoint,
  SectionPointContext,
} from "../../../../../src/browser/features/report/leaf-point-context.ts"
import { FoldedLeafFrame } from "../../../../../src/browser/features/report/leaf/report-leaf-frame.tsx"
import {
  leafFrameClassNames,
  loadMarkdown,
} from "../../../../../src/browser/features/report/markdown.tsx"
import { ReplyPointScope } from "../../../../../src/browser/features/report/reply-point.tsx"
import {
  type ReplyPort,
  ReplyPortContext,
  type ReplyPortSlot,
} from "../../../../../src/browser/features/report/reply-port.ts"
import { useReplyNotes } from "../../../../../src/browser/stores/reply-note-list.ts"
import type { LeafValue } from "../../../../../src/shared/report/report-leaf-value.ts"

const CAPTION_SELECTOR = `.${leafFrameClassNames.caption}`

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
  useReplyNotes.setState(useReplyNotes.getInitialState(), true)
})

type FrameValue = Pick<LeafValue, "captionNumber" | "gutterNotes">

const VALUE: FrameValue = { captionNumber: { kind: "none" }, gutterNotes: [] }
const SECTION: SectionPoint = { kind: "section", reportToolUseId: "toolu_1", heading: "架空の節" }
const LEAF: LeafIdentity = { kind: "leaf", componentId: "p1", componentKind: "Paragraph" }

function askFrame(options: {
  readonly slot: ReplyPortSlot
  readonly section: SectionPoint
  readonly leaf: LeafIdentity
  readonly value?: FrameValue
}) {
  return render(
    <ReplyPortContext value={options.slot}>
      <ReplyPointScope rootRef={createRef<HTMLElement>()}>
        <SectionPointContext value={options.section}>
          <LeafIdentityContext value={options.leaf}>
            <div data-report-region="section">
              <FoldedLeafFrame
                value={options.value ?? VALUE}
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
    </ReplyPortContext>,
  )
}

function askButtonCount(): number {
  return screen.queryAllByRole("button", { name: /^(聞く|頼む|聞く・頼む)$/ }).length
}

function idlePort(ask = vi.fn<ReplyPort["ask"]>()): ReplyPort {
  return {
    appendDraft: vi.fn<ReplyPort["appendDraft"]>(),
    prependDraft: vi.fn<ReplyPort["prependDraft"]>(),
    ask,
  }
}

describe("FoldedLeafFrame の「聞く・頼む」", () => {
  it("何も押していないときは「聞く」「頼む」のボタンを出さず、部品を押すと「聞く・頼む」が1つだけ出る", () => {
    askFrame({ slot: { kind: "open", port: idlePort() }, section: SECTION, leaf: LEAF })
    expect(askButtonCount()).toBe(0)

    fireEvent.click(screen.getByText("架空の本体"))

    expect(askButtonCount()).toBe(1)
    expect(screen.getByRole("button", { name: "聞く・頼む" })).toBeTruthy()
  })

  it("題の行を持つ部品は題の行を押して指し、指した題の行に印が付く", () => {
    const { container } = askFrame({
      slot: { kind: "open", port: idlePort() },
      section: SECTION,
      leaf: LEAF,
      value: { captionNumber: { kind: "table", ordinal: 1 }, gutterNotes: [] },
    })
    fireEvent.click(screen.getByText("架空の本体"))
    expect(askButtonCount()).toBe(0)

    fireEvent.click(screen.getByText("架空の題"))

    expect(container.querySelector(`${CAPTION_SELECTOR}[data-pointed]`)).not.toBeNull()
    expect(askButtonCount()).toBe(1)
  })

  it("題の行の無い部品は本体が Tab の止まり場で、フォーカスすると指し、Enter で開いて Esc で本体へ戻る", () => {
    const { container } = askFrame({
      slot: { kind: "open", port: idlePort() },
      section: SECTION,
      leaf: LEAF,
    })
    const stops = container.querySelectorAll<HTMLElement>("[data-reply-unit][tabindex='0']")
    expect(stops).toHaveLength(1)
    const body = stops[0]
    if (body === undefined) throw new Error("止まり場が無い")

    act(() => {
      body.focus()
    })
    expect(askButtonCount()).toBe(1)
    fireEvent.keyDown(body, { key: "Enter" })
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" })

    expect(screen.queryByRole("textbox")).toBeNull()
    expect(document.activeElement).toBe(body)
  })

  it("単位の外を押すと指すのをやめる", () => {
    askFrame({ slot: { kind: "open", port: idlePort() }, section: SECTION, leaf: LEAF })
    fireEvent.click(screen.getByText("架空の本体"))

    fireEvent.pointerDown(document.body)

    expect(askButtonCount()).toBe(0)
  })

  it("「聞く・頼む」で聞くの欄が開き、書いて送ると指した所つきで ask を呼ぶ", () => {
    const ask = vi.fn<ReplyPort["ask"]>()
    askFrame({ slot: { kind: "open", port: idlePort(ask) }, section: SECTION, leaf: LEAF })

    fireEvent.click(screen.getByText("架空の本体"))
    fireEvent.click(screen.getByRole("button", { name: "聞く・頼む" }))
    expect(screen.getByRole("radio", { name: "聞く" })).toHaveProperty("checked", true)
    const field = screen.getByRole("textbox")
    fireEvent.change(field, { target: { value: "なぜ？" } })
    fireEvent.keyDown(field, { key: "Enter", metaKey: true })

    expect(ask).toHaveBeenCalledExactlyOnceWith(
      {
        label: { section: "架空の節", component: "架空の題" },
        key: { reportToolUseId: "toolu_1", componentId: "p1" },
      },
      "なぜ？",
    )
    expect(screen.queryByRole("textbox")).toBeNull()
  })

  it("欄を頼むに切り替えて送ると付箋が増えて ask は呼ばれない", () => {
    const ask = vi.fn<ReplyPort["ask"]>()
    askFrame({ slot: { kind: "open", port: idlePort(ask) }, section: SECTION, leaf: LEAF })

    fireEvent.click(screen.getByText("架空の本体"))
    fireEvent.click(screen.getByRole("button", { name: "聞く・頼む" }))
    fireEvent.click(screen.getByRole("radio", { name: "頼む" }))
    expect(screen.getByText("付箋にして、あとでまとめて頼む")).toBeTruthy()
    const field = screen.getByRole("textbox")
    fireEvent.change(field, { target: { value: "ここを直して" } })
    fireEvent.keyDown(field, { key: "Enter", metaKey: true })

    const notes = Object.values(useReplyNotes.getState().notesBySession).flat()
    expect(notes).toHaveLength(1)
    expect(notes[0]?.body).toBe("ここを直して")
    expect(notes[0]?.target.key).toEqual({ reportToolUseId: "toolu_1", componentId: "p1" })
    expect(ask).not.toHaveBeenCalled()
    expect(screen.queryByRole("textbox")).toBeNull()
  })

  it("口が無いか、節の外（図・振り返り・頭の欄）か、内容部品の外（配置の部品の枠）なら、押しても出ない", () => {
    const cases: readonly Parameters<typeof askFrame>[0][] = [
      { slot: { kind: "none" }, section: SECTION, leaf: LEAF },
      { slot: { kind: "open", port: idlePort() }, section: { kind: "none" }, leaf: LEAF },
      { slot: { kind: "open", port: idlePort() }, section: SECTION, leaf: { kind: "none" } },
    ]
    for (const options of cases) {
      askFrame(options)
      fireEvent.click(screen.getByText("架空の本体"))
      expect(askButtonCount()).toBe(0)
      cleanup()
    }
  })
})
