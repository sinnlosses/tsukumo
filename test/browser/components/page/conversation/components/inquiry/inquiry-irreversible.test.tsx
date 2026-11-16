import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Inquiry } from "../../../../../../../src/browser/components/page/conversation/components/inquiry/inquiry.tsx"
import {
  useInquiryDraft,
  useInquiryFocus,
} from "../../../../../../../src/browser/components/page/conversation/stores/inquiry-draft.ts"
import type { QuestionOption } from "../../../../../../../src/shared/session-driver/question.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { putSession } from "../../../../../session-store.ts"

/** 「任せる」の予告と、戻せない選択肢の2段の確定。 */

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

const NOTE = "戻せない操作。⏎ だけでは確定しない"

function option(label: string): QuestionOption {
  return { label, description: `架空の説明（${label}）`, preview: undefined }
}

function renderIrreversible(labels: readonly string[], calls: unknown[]): void {
  putSession(
    {
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
              options: labels.map(option),
            },
          ],
          imageSizes: [],
          unshelvedImages: [],
          askedAt: 0,
          briefs: [
            {
              header: "架空の選択",
              whyAsk: "架空の理由",
              facts: [],
              options: labels.map((label) => ({
                label,
                irreversible: label.startsWith("B案"),
                figures: [],
              })),
            },
          ],
        },
      ],
    },
    (command) => calls.push(command),
  )
  render(<Inquiry />)
}

function card(): HTMLElement {
  return screen.getByRole("region", { name: "お伺い" })
}

describe("Inquiry の任せるの予告と2段の確定", () => {
  it("おすすめがあるときは選ばれる案の名前を口に言い、おすすめが戻せない案のときは口を出さない", () => {
    renderIrreversible(["A案 (推奨)", "B案"], [])
    expect(screen.getByRole("button", { name: "おすすめに任せる（A案）" })).toBeDefined()
    cleanup()

    renderIrreversible(["A案", "B案 (推奨)"], [])
    expect(screen.queryByRole("button", { name: /任せる/ })).toBeNull()
  })

  it("戻せない案を選ぶと、注意の行が出て口が「これで確定する」に替わり、⏎ だけでは確定しない", () => {
    const calls: unknown[] = []
    renderIrreversible(["A案", "B案"], calls)
    expect(screen.queryByText(NOTE)).toBeNull()

    fireEvent.keyDown(card(), { key: "2" })
    expect(screen.getByText(NOTE)).toBeDefined()
    expect(screen.queryByRole("button", { name: /これで答える/ })).toBeNull()

    fireEvent.keyDown(card(), { key: "Enter" })
    expect(calls).toEqual([])

    fireEvent.keyDown(card(), { key: "Enter", shiftKey: true })
    expect(calls).toHaveLength(1)
  })

  it("2段目の口をクリックすると確定し、戻せる案へ選び替えると1段目に戻る", () => {
    const calls: unknown[] = []
    renderIrreversible(["A案", "B案"], calls)

    fireEvent.keyDown(card(), { key: "2" })
    fireEvent.keyDown(card(), { key: "1" })
    expect(screen.queryByText(NOTE)).toBeNull()
    fireEvent.keyDown(card(), { key: "Enter" })
    expect(calls).toHaveLength(1)
    cleanup()

    const second: unknown[] = []
    renderIrreversible(["A案", "B案"], second)
    fireEvent.keyDown(card(), { key: "2" })
    fireEvent.click(screen.getByRole("button", { name: /これで確定する/ }))
    expect(second).toHaveLength(1)
  })
})
