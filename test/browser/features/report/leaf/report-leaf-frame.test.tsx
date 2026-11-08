import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import {
  AskThreadContext,
  type AskThreadSlot,
} from "../../../../../src/browser/features/report/ask-thread-context.ts"
import {
  type AskPair,
  askLeafKey,
  type LeafAskThread,
} from "../../../../../src/browser/features/report/domain/ask-thread.ts"
import {
  type LeafIdentity,
  LeafIdentityContext,
  type SectionPoint,
  SectionPointContext,
} from "../../../../../src/browser/features/report/leaf-point-context.ts"
import {
  LeafFold,
  FoldedLeafFrame,
} from "../../../../../src/browser/features/report/leaf/report-leaf-frame.tsx"
import {
  leafFrameClassNames,
  loadMarkdown,
} from "../../../../../src/browser/features/report/markdown.tsx"
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

const NO_CAPTION: FrameValue["captionNumber"] = { kind: "none" }

function frame(value: FrameValue, title: string, fold = "") {
  return render(
    <div data-report-region="section">
      <FoldedLeafFrame value={value} title={title} fit={false} fold={fold} swap={false}>
        <p>架空の本体</p>
      </FoldedLeafFrame>
    </div>,
  )
}

describe("FoldedLeafFrame", () => {
  it("番号も欄外注も無い内容部品は、本体だけを欄の直接の子に返す", () => {
    const { container } = frame({ captionNumber: NO_CAPTION, gutterNotes: [] }, "架空の題")

    const region = container.querySelector("[data-report-region]")
    expect([...(region?.children ?? [])].map((child) => child.tagName)).toEqual(["P"])
  })

  it("図の題は本体の下に、番号をテキストノードで出す", () => {
    const { container } = frame(
      { captionNumber: { kind: "figure", ordinal: 3 }, gutterNotes: [] },
      "架空の題",
    )

    const wrapper = container.querySelector("[data-report-region] > div")
    const caption = wrapper?.querySelector(CAPTION_SELECTOR)
    expect(wrapper?.lastElementChild).toBe(caption)
    expect(caption?.firstElementChild?.firstChild?.nodeType).toBe(Node.TEXT_NODE)
    expect(caption?.textContent).toBe("図 3架空の題")
  })

  it("表の題は本体の上に出し、題の字が空なら番号だけを出す", () => {
    const { container } = frame(
      { captionNumber: { kind: "table", ordinal: 1 }, gutterNotes: [] },
      "",
    )

    const wrapper = container.querySelector("[data-report-region] > div")
    const caption = wrapper?.querySelector(CAPTION_SELECTOR)
    expect(wrapper?.firstElementChild).toBe(caption)
    expect(caption?.children).toHaveLength(1)
    expect(caption?.textContent).toBe("表 1")
  })

  it("題の行の右端の子は表の題の中に置き、欄が無い題は子を足さず1つの div のまま", () => {
    const value: FrameValue = {
      captionNumber: { kind: "table", ordinal: 1 },
      gutterNotes: [],
    }
    const { container } = render(
      <div data-report-region="section">
        <FoldedLeafFrame
          value={value}
          title="架空の題"
          fit={false}
          fold=""
          swap={false}
          captionAside={<button type="button">架空のバッジ</button>}
        >
          <p>架空の本体</p>
        </FoldedLeafFrame>
      </div>,
    )

    const caption = container.querySelector(CAPTION_SELECTOR)
    expect(caption?.lastElementChild?.tagName).toBe("BUTTON")
    expect(caption?.textContent).toBe("表 1架空の題架空のバッジ")
    cleanup()

    const plain = frame(value, "架空の題")
    const plainCaption = plain.container.querySelector(CAPTION_SELECTOR)
    expect(plainCaption?.children).toHaveLength(2)
    expect(plainCaption?.querySelector("span > span")).toBeNull()
  })

  it("欄外注は欄外注の列の外枠に、ラベルと字をテキストとして出し、本体と並べる", () => {
    const { container } = frame(
      {
        captionNumber: NO_CAPTION,
        gutterNotes: [
          { label: "メモ", text: "架空の欄外注" },
          { label: "", text: "ラベルの無い欄外注" },
        ],
      },
      "",
    )

    const outer = container.querySelector("[data-report-region] > div")
    const gutter = outer?.querySelector(`.${leafFrameClassNames.gutter}`)
    expect(outer?.firstElementChild?.tagName).toBe("P")
    expect(gutter?.parentElement).toBe(outer)
    expect([...(gutter?.querySelectorAll("aside") ?? [])].map((note) => note.textContent)).toEqual([
      "メモ架空の欄外注",
      "ラベルの無い欄外注",
    ])
  })

  it("欄外注の字の inline code は code 要素で描く", () => {
    const { container } = frame(
      { captionNumber: NO_CAPTION, gutterNotes: [{ label: "", text: "架空の欄外注 `a.ts`" }] },
      "",
    )

    expect(container.querySelector("aside code")?.textContent).toBe("a.ts")
  })

  it("題の字の inline code は code 要素で描く", () => {
    const { container } = frame(
      { captionNumber: { kind: "figure", ordinal: 1 }, gutterNotes: [] },
      "架空の `a.ts` の題",
    )

    expect(container.querySelector(`${CAPTION_SELECTOR} code`)?.textContent).toBe("a.ts")
  })

  it("fold があれば題つきの外枠を details で畳み、欄外注の列は details の外に置く", () => {
    const { container } = frame(
      {
        captionNumber: { kind: "table", ordinal: 1 },
        gutterNotes: [{ label: "", text: "架空の欄外注" }],
      },
      "架空の題",
      "架空の畳み",
    )

    const outer = container.querySelector("[data-report-region] > div")
    const details = outer?.firstElementChild
    expect(details?.tagName).toBe("DETAILS")
    expect(details?.querySelector("summary")?.textContent).toBe("架空の畳み")
    expect(details?.querySelector(CAPTION_SELECTOR)).not.toBeNull()
    expect(outer?.lastElementChild?.classList.contains(leafFrameClassNames.gutter)).toBe(true)
  })

  it("題と欄外注の両方があれば、題つきの外枠を欄外注の外枠が外から囲む", () => {
    const { container } = frame(
      {
        captionNumber: { kind: "figure", ordinal: 2 },
        gutterNotes: [{ label: "", text: "架空の欄外注" }],
      },
      "架空の題",
    )

    const outer = container.querySelector("[data-report-region] > div")
    expect(outer?.children).toHaveLength(2)
    expect(outer?.firstElementChild?.querySelector(CAPTION_SELECTOR)).not.toBeNull()
    expect(outer?.lastElementChild?.classList.contains(leafFrameClassNames.gutter)).toBe(true)
  })
})

describe("FoldedLeafFrame の「聞く」", () => {
  const VALUE: FrameValue = { captionNumber: NO_CAPTION, gutterNotes: [] }

  function askFrame(options: {
    readonly slot: ReplyPortSlot
    readonly section: SectionPoint
    readonly leaf: LeafIdentity
  }) {
    return render(
      <ReplyPortContext value={options.slot}>
        <SectionPointContext value={options.section}>
          <LeafIdentityContext value={options.leaf}>
            <div data-report-region="section">
              <FoldedLeafFrame value={VALUE} title="架空の題" fit={false} fold="" swap={false}>
                <p>架空の本体</p>
              </FoldedLeafFrame>
            </div>
          </LeafIdentityContext>
        </SectionPointContext>
      </ReplyPortContext>,
    )
  }

  function idlePort(): ReplyPort {
    return {
      appendDraft: vi.fn<ReplyPort["appendDraft"]>(),
      ask: vi.fn<ReplyPort["ask"]>(),
    }
  }

  const SECTION: SectionPoint = { kind: "section", reportToolUseId: "toolu_1", heading: "架空の節" }
  const LEAF: LeafIdentity = { kind: "leaf", componentId: "p1", componentKind: "Paragraph" }

  it("口があり節の中の内容部品なら「聞く」が出て、押して書いて送ると指した所つきで ask を呼ぶ", () => {
    const ask = vi.fn<ReplyPort["ask"]>()
    askFrame({
      slot: { kind: "open", port: { appendDraft: vi.fn<ReplyPort["appendDraft"]>(), ask } },
      section: SECTION,
      leaf: LEAF,
    })

    fireEvent.click(screen.getByRole("button", { name: "聞く" }))
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

  it("部品の「頼む」で頼むの欄が開き、送ると付箋が増えて ask は呼ばれない", () => {
    const ask = vi.fn<ReplyPort["ask"]>()
    askFrame({
      slot: { kind: "open", port: { appendDraft: vi.fn<ReplyPort["appendDraft"]>(), ask } },
      section: SECTION,
      leaf: LEAF,
    })

    fireEvent.click(screen.getByRole("button", { name: "頼む" }))
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

  it("口が無ければ出ない", () => {
    askFrame({ slot: { kind: "none" }, section: SECTION, leaf: LEAF })

    expect(screen.queryByRole("button", { name: "聞く" })).toBeNull()
    expect(screen.queryByRole("button", { name: "頼む" })).toBeNull()
  })

  it("指す位置が節の外（図・振り返り・頭の欄）なら出ない", () => {
    askFrame({
      slot: { kind: "open", port: idlePort() },
      section: { kind: "none" },
      leaf: LEAF,
    })

    expect(screen.queryByRole("button", { name: "聞く" })).toBeNull()
  })

  it("内容部品の外（配置の部品の枠）では出ない", () => {
    askFrame({
      slot: { kind: "open", port: idlePort() },
      section: SECTION,
      leaf: { kind: "none" },
    })

    expect(screen.queryByRole("button", { name: "聞く" })).toBeNull()
  })
})

describe("FoldedLeafFrame の聞いた問いと答え", () => {
  const SECTION: SectionPoint = { kind: "section", reportToolUseId: "toolu_1", heading: "架空の節" }
  const LEAF: LeafIdentity = { kind: "leaf", componentId: "p1", componentKind: "Paragraph" }
  const KEY = askLeafKey("toolu_1", "p1")
  const answeredPair: AskPair = {
    question: "なぜ？",
    answer: { kind: "answered", text: "架空の理由だから。" },
  }
  const waitingPair: AskPair = { question: "いつ？", answer: { kind: "waiting" } }

  function threadsOf(...pairs: readonly AskPair[]): AskThreadSlot {
    const thread: LeafAskThread = {
      pairs,
      waiting: pairs.some((pair) => pair.answer.kind === "waiting"),
      count: pairs.length,
    }
    return { kind: "grouped", byLeaf: new Map([[KEY, thread]]), remaining: [] }
  }

  function threadFrame(
    threads: AskThreadSlot,
    captionNumber: FrameValue["captionNumber"] = NO_CAPTION,
    ask?: ReplyPort["ask"],
  ) {
    return render(
      <ReplyPortContext
        value={{
          kind: "open",
          port: {
            appendDraft: vi.fn<ReplyPort["appendDraft"]>(),
            ask: ask ?? vi.fn<ReplyPort["ask"]>(),
          },
        }}
      >
        <AskThreadContext value={threads}>
          <SectionPointContext value={SECTION}>
            <LeafIdentityContext value={LEAF}>
              <div data-report-region="section">
                <FoldedLeafFrame
                  value={{ captionNumber, gutterNotes: [] }}
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
        </AskThreadContext>
      </ReplyPortContext>,
    )
  }

  it("答えた対は問いと答えを出し、題の行にバッジ「聞 1・答えた」が付く", () => {
    const { container } = threadFrame(threadsOf(answeredPair), { kind: "table", ordinal: 1 })

    expect(screen.getByText("なぜ？")).toBeTruthy()
    expect(screen.getByText(/架空の理由だから。/)).toBeTruthy()
    expect(container.querySelector(CAPTION_SELECTOR)?.textContent).toContain("聞 1・答えた")
  })

  it("答え待ちの対は「作業は始めていない」を出し、バッジは答え待ち、続けて聞くは出ない", () => {
    threadFrame(threadsOf(answeredPair, waitingPair), { kind: "table", ordinal: 1 })

    expect(screen.getByText(/作業は始めていない/)).toBeTruthy()
    expect(screen.getByText("聞 2・答え待ち")).toBeTruthy()
    expect(screen.getAllByRole("button", { name: "続けて聞く" })).toHaveLength(1)
  })

  it("題の行を持たない部品は、バッジを答えの欄の頭に置く", () => {
    const { container } = threadFrame(threadsOf(answeredPair))

    expect(container.querySelector(CAPTION_SELECTOR)).toBeNull()
    expect(screen.getByText("聞 1・答えた")).toBeTruthy()
  })

  it("続けて聞くで、同じ指した所のその場の入力欄が開く", () => {
    const ask = vi.fn<ReplyPort["ask"]>()
    threadFrame(threadsOf(answeredPair), NO_CAPTION, ask)

    fireEvent.click(screen.getByRole("button", { name: "続けて聞く" }))
    const field = screen.getByRole("textbox")
    fireEvent.change(field, { target: { value: "もっと？" } })
    fireEvent.keyDown(field, { key: "Enter", metaKey: true })

    expect(ask).toHaveBeenCalledExactlyOnceWith(
      {
        label: { section: "架空の節", component: "架空の題" },
        key: { reportToolUseId: "toolu_1", componentId: "p1" },
      },
      "もっと？",
    )
  })

  it("これを頼むで、答えの字が入った頼むの欄が開く。付箋は欄で送るまで作らない", () => {
    threadFrame(threadsOf(answeredPair))

    fireEvent.click(screen.getByRole("button", { name: "これを頼む" }))

    expect(screen.getByDisplayValue("架空の理由だから。")).toBeTruthy()
    expect(screen.getByRole("radio", { name: "頼む" })).toHaveProperty("checked", true)
    expect(Object.values(useReplyNotes.getState().notesBySession).flat()).toHaveLength(0)
  })

  it("答え待ちの対にも、口が無い描画にも、これを頼むは出ない", () => {
    threadFrame(threadsOf(waitingPair))
    expect(screen.queryByRole("button", { name: "これを頼む" })).toBeNull()
    cleanup()

    threadFrame({ kind: "none" })
    expect(screen.queryByRole("button", { name: "これを頼む" })).toBeNull()
  })

  it("行を指した対の続けて聞くは、同じ行の入力欄を開く", () => {
    const ask = vi.fn<ReplyPort["ask"]>()
    threadFrame(
      threadsOf({ ...answeredPair, row: { index: 2, label: "架空の行" } }),
      NO_CAPTION,
      ask,
    )

    fireEvent.click(screen.getByRole("button", { name: "続けて聞く" }))
    const field = screen.getByRole("textbox")
    fireEvent.change(field, { target: { value: "もっと？" } })
    fireEvent.keyDown(field, { key: "Enter", metaKey: true })

    expect(ask.mock.calls[0]?.[0].key).toEqual({
      reportToolUseId: "toolu_1",
      componentId: "p1",
      rowIndex: 2,
    })
  })

  it("束の口が無い描画では何も増えない", () => {
    threadFrame({ kind: "none" }, { kind: "table", ordinal: 1 })

    expect(screen.queryByText(/聞 \d/)).toBeNull()
    expect(screen.queryByRole("button", { name: "続けて聞く" })).toBeNull()
  })
})

describe("LeafFold", () => {
  function fold(props: { readonly fold: string; readonly empty: boolean }) {
    return render(
      <div data-report-region="section">
        <LeafFold fold={props.fold} empty={props.empty}>
          <p>架空の本体</p>
        </LeafFold>
      </div>,
    )
  }

  it("fold が空なら本体をそのまま返す", () => {
    const { container } = fold({ fold: " ", empty: false })

    expect(
      [...(container.querySelector("[data-report-region]")?.children ?? [])].map(
        (child) => child.tagName,
      ),
    ).toEqual(["P"])
  })

  it("本体が空なら畳まない", () => {
    const { container } = fold({ fold: "架空の題", empty: true })

    expect(container.querySelector("details")).toBeNull()
  })

  it("fold があれば details で包み、summary の字は行内の印を素の字に畳む", () => {
    const { container } = fold({ fold: "架空の根拠 {{1 → 2}}", empty: false })

    expect(container.querySelector("details > summary")?.textContent).toBe("架空の根拠 1 → 2")
    expect(container.querySelector("details > p")).not.toBeNull()
  })
})
