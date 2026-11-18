import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Inquiry } from "../../../../../../../src/browser/components/page/conversation/components/inquiry/inquiry.tsx"
import {
  useInquiryDraft,
  useInquiryFocus,
} from "../../../../../../../src/browser/components/page/conversation/stores/inquiry-draft.ts"
import { useInquiryJump } from "../../../../../../../src/browser/stores/inquiry-jump.ts"
import type { StampedPendingAsk } from "../../../../../../../src/shared/session-driver/pending-ask.ts"
import type { Question } from "../../../../../../../src/shared/session-driver/question.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { putSession } from "../../../../../session-store.ts"

// 札の寸法の変化を、テストが好きなときに知らせる。
class FakeResizeObserver {
  static readonly instances: FakeResizeObserver[] = []
  readonly callback: () => void

  constructor(callback: () => void) {
    this.callback = callback
    FakeResizeObserver.instances.push(this)
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  FakeResizeObserver.instances.length = 0
  vi.stubGlobal("ResizeObserver", FakeResizeObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
  cleanup()
  useInquiryDraft.setState(useInquiryDraft.getInitialState(), true)
  useInquiryFocus.setState(useInquiryFocus.getInitialState(), true)
  useInquiryJump.setState(useInquiryJump.getInitialState(), true)
})

const QUESTION = {
  header: "架空の選択",
  text: "架空の質問",
  multiSelect: false,
  options: [
    { label: "A案", description: "架空の説明（A案）", preview: undefined },
    { label: "B案", description: "架空の説明（B案）", preview: undefined },
  ],
} satisfies Question

const QUESTION_PENDING = {
  kind: "question",
  id: "ask-1",
  questions: [QUESTION],
  briefs: [],
  imageSizes: [],
  unshelvedImages: [],
  askedAt: 0,
} satisfies StampedPendingAsk

function renderInquiry(): void {
  putSession({ ...INITIAL_SESSION_STATE, pending: [QUESTION_PENDING] })
  render(<Inquiry />)
}

/** 次の描画まで待つ（札へ連れてくるスクロールは次の描画で走る）。 */
async function nextFrame(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        resolve()
      })
    })
  })
}

function card(): HTMLElement {
  return screen.getByRole("region", { name: "お伺い" })
}

describe("Inquiry（お伺いのカードへ連れてくるスクロール）", () => {
  it("答え待ちが来たら、次の描画で札まで連れてくる（scrollIntoView）", async () => {
    const scrollIntoView = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {})
    try {
      renderInquiry()
      expect(scrollIntoView).toHaveBeenCalledTimes(0)

      await nextFrame()
      expect(scrollIntoView).toHaveBeenCalledTimes(1)
      expect(scrollIntoView.mock.calls[0]?.[0]).toEqual({ block: "nearest", behavior: "smooth" })
    } finally {
      scrollIntoView.mockRestore()
    }
  })

  it("フォーカスした選択肢が替わって詳細が伸びたら、札を見える範囲へ送り直す（scrollIntoView）", async () => {
    const scrollIntoView = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {})
    try {
      renderInquiry()
      await nextFrame()
      expect(scrollIntoView).toHaveBeenCalledTimes(1)

      fireEvent.focus(screen.getByRole("radio", { name: /A案/ }))
      expect(scrollIntoView).toHaveBeenCalledTimes(2)

      fireEvent.focus(screen.getByRole("radio", { name: /B案/ }))
      expect(scrollIntoView).toHaveBeenCalledTimes(3)
      expect(scrollIntoView.mock.calls[2]?.[0]).toEqual({ block: "nearest", behavior: "smooth" })

      fireEvent.focus(screen.getByRole("radio", { name: /B案/ }))
      expect(scrollIntoView).toHaveBeenCalledTimes(3)
    } finally {
      scrollIntoView.mockRestore()
    }
  })

  it.each([
    { name: "頭が見えている札が伸びたら、見える範囲へ送り直す", top: 200, calls: 1 },
    { name: "転がして札の頭が見える範囲の上へ出ていたら、伸びても動かさない", top: -50, calls: 0 },
  ])("$name（scrollIntoView）", async ({ top, calls }) => {
    const scrollIntoView = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {})
    try {
      renderInquiry()
      await nextFrame()
      scrollIntoView.mockClear()
      vi.spyOn(card(), "getBoundingClientRect").mockReturnValue(
        DOMRect.fromRect({ x: 0, y: top, width: 600, height: 700 }),
      )

      act(() => {
        for (const observer of FakeResizeObserver.instances) {
          observer.callback()
        }
      })

      expect(scrollIntoView).toHaveBeenCalledTimes(calls)
    } finally {
      scrollIntoView.mockRestore()
    }
  })
})
