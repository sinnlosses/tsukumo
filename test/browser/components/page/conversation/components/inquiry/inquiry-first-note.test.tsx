import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Inquiry } from "../../../../../../../src/browser/components/page/conversation/components/inquiry/inquiry.tsx"
import { useInquiryDraft } from "../../../../../../../src/browser/components/page/conversation/stores/inquiry-draft.ts"
import { loadSeenFirstNotes } from "../../../../../../../src/browser/domain/first-note.ts"
import { useFirstNoteSeen } from "../../../../../../../src/browser/stores/first-note-seen.ts"
import type { QuestionBrief } from "../../../../../../../src/shared/session-driver/question-brief.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { putSession } from "../../../../../session-store.ts"

const STORAGE_KEY = "tsukumo-first-note-seen:v1"

class FakeResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const brief = {
  header: "架空の選択",
  whyAsk: "架空の聞く理由の文",
  facts: [{ text: "架空の数の話", basis: "checked" }],
  recommended: { reason: "架空の根拠の文", certainty: "medium" },
  options: [
    { label: "A案", irreversible: false, figures: [] },
    { label: "B案", irreversible: false, figures: [] },
  ],
} satisfies QuestionBrief

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver)
  putSession({
    ...INITIAL_SESSION_STATE,
    pending: [
      {
        kind: "question",
        id: "ask-1",
        questions: [
          {
            header: "架空の選択",
            text: "架空の質問",
            multiSelect: false,
            options: [
              { label: "A案", description: "", preview: "架空のプレビューA" },
              { label: "B案", description: "", preview: undefined },
            ],
          },
        ],
        briefs: [brief],
        imageSizes: [],
        unshelvedImages: [],
        askedAt: 0,
      },
    ],
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  cleanup()
  localStorage.clear()
  useFirstNoteSeen.setState({ seen: [] })
  useInquiryDraft.setState(useInquiryDraft.getInitialState(), true)
})

function savedNotes(): unknown {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")
}

describe("お伺いの初回の説明", () => {
  it("「確かめた」「確度」の説明を初回だけ1行で出し、「分かった」で次から出さない", () => {
    const { container } = render(<Inquiry />)

    expect(container.querySelector("[data-first-note='inquiry-terms']")?.textContent).toContain(
      "「確度」はおすすめへの自信の程度",
    )
    expect(savedNotes()).toEqual([])

    fireEvent.click(screen.getByRole("button", { name: "分かった" }))

    expect(container.querySelector("[data-first-note]")).toBeNull()
    expect(savedNotes()).toEqual(["inquiry-terms"])
  })

  it("見たあとも、印のツールチップと aria-description で同じ説明が読める", () => {
    useFirstNoteSeen.getState().markSeen("inquiry-terms")
    render(<Inquiry />)

    const mark = screen.getByText("確度 中")
    expect(mark.getAttribute("title")).toContain("おすすめへの自信の程度")
    expect(mark.getAttribute("aria-description")).toContain("おすすめへの自信の程度")
    expect(screen.getByText("確かめた").closest("[aria-description]")).not.toBeNull()
  })

  it("読み込み直したあとも、見た説明は出ない", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["inquiry-terms"]))
    useFirstNoteSeen.setState({ seen: loadSeenFirstNotes() })
    const { container } = render(<Inquiry />)

    expect(container.querySelector("[data-first-note]")).toBeNull()
  })
})
