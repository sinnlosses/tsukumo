import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Inquiry } from "../../../../../../../src/browser/components/page/conversation/components/inquiry/inquiry.tsx"
import {
  useInquiryDraft,
  useInquiryFocus,
} from "../../../../../../../src/browser/components/page/conversation/stores/inquiry-draft.ts"
import type { StampedPendingAsk } from "../../../../../../../src/shared/session-driver/pending-ask.ts"
import type { Question } from "../../../../../../../src/shared/session-driver/question.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { putSession } from "../../../../../session-store.ts"

class FakeResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
  cleanup()
  useInquiryDraft.setState(useInquiryDraft.getInitialState(), true)
  useInquiryFocus.setState(useInquiryFocus.getInitialState(), true)
})

function question(header: string): Question {
  return {
    header,
    text: `架空の質問（${header}）`,
    multiSelect: false,
    options: [
      { label: "A案", description: "架空の説明A", preview: undefined },
      { label: "B案", description: "架空の説明B", preview: undefined },
    ],
  }
}

function ask(questions: readonly Question[], certainty: "high" | "medium" | "low" = "medium") {
  return {
    kind: "question",
    id: "ask-1",
    questions,
    briefs: questions.map((shown) => ({
      header: shown.header,
      whyAsk: "架空の聞く理由の文",
      facts: [
        { text: "架空の数の話", basis: "checked" },
        { text: "架空の本文の話", basis: "copied" },
      ],
      recommended: { reason: "架空の根拠の文", certainty },
      options: [
        { label: "A案", irreversible: false, figures: [] },
        { label: "B案", irreversible: true, figures: [] },
      ],
    })),
    imageSizes: [],
    unshelvedImages: [],
    askedAt: 0,
  } satisfies StampedPendingAsk
}

const PERMISSION = {
  kind: "permission",
  id: "ask-perm",
  toolName: "Bash",
  input: { command: "echo 架空" },
  askedAt: 0,
} satisfies StampedPendingAsk

function renderInquiry(pending: readonly StampedPendingAsk[]): HTMLElement {
  putSession({ ...INITIAL_SESSION_STATE, pending })
  render(<Inquiry />)
  return screen.getByRole("region", { name: "お伺い" })
}

function head(card: HTMLElement): HTMLElement {
  const element = card.querySelector("header")
  if (element === null) {
    throw new Error("頭が無い")
  }
  return element
}

describe("お伺いの頭", () => {
  it("「n / N」は2問以上のときだけ出す", () => {
    const single = renderInquiry([ask([question("一つ目")])])
    expect(head(single).textContent).not.toMatch(/\d \/ \d/)
    cleanup()

    const permission = renderInquiry([PERMISSION])
    expect(head(permission).textContent).not.toMatch(/\d \/ \d/)
    cleanup()

    const multi = renderInquiry([ask([question("一つ目"), question("二つ目")])])
    expect(within(head(multi)).getByText("1 / 2")).toBeDefined()
  })

  it("「お伺い」のチップを出さず、種類・題・待ち時間・「広げる」を並べる", () => {
    const card = renderInquiry([ask([question("保存先")])])
    const inHead = within(head(card))

    expect(inHead.queryByText("お伺い")).toBeNull()
    expect(inHead.getByText("質問")).toBeDefined()
    expect(inHead.getByText("保存先")).toBeDefined()
    expect(inHead.getByText(/待って \d+:\d\d/)).toBeDefined()
    expect(inHead.getByRole("button", { name: "広げる" })).toBeDefined()
    cleanup()

    const permission = renderInquiry([PERMISSION])
    expect(within(head(permission)).getByText("許可")).toBeDefined()
    expect(within(head(permission)).getByText("Bash")).toBeDefined()
  })

  it("カードの中に、入力欄に書いて答えられる案内を置かない", () => {
    const card = renderInquiry([ask([question("保存先")])])

    expect(within(card).queryByText(/入力欄に書いて送れます/)).toBeNull()
  })
})

describe("お伺いの印の2系統", () => {
  it("確かめた・戻せないは塗り（data-tone あり）、写した・おすすめ・確度は線だけ（data-tone なし）", () => {
    const card = renderInquiry([ask([question("保存先")])])

    expect(
      within(card).getByText("確かめた").closest("[data-tone]")?.getAttribute("data-tone"),
    ).toBe("ok")
    expect(
      within(card).getByText("⚠ 戻せない").closest("[data-tone]")?.getAttribute("data-tone"),
    ).toBe("ng")
    expect(within(card).getByText("写した").closest("[data-tone]")).toBeNull()
    expect(within(card).getByText("確度 中").closest("[data-tone]")).toBeNull()
  })

  it.each([["high"], ["medium"], ["low"]] as const)("確度 %s に色の印を付けない", (certainty) => {
    const card = renderInquiry([ask([question("保存先")], certainty)])
    const label = { high: "確度 高", medium: "確度 中", low: "確度 低" }[certainty]

    expect(within(card).getByText(label).closest("[data-tone]")).toBeNull()
  })
})
