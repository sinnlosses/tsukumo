import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Inquiry } from "../../../../../../../src/browser/components/page/conversation/components/inquiry/inquiry.tsx"
import {
  useInquiryDraft,
  useInquiryFocus,
} from "../../../../../../../src/browser/components/page/conversation/stores/inquiry-draft.ts"
import { acquireOverlay } from "../../../../../../../src/browser/hooks/open-overlay.ts"
import { useComposerFocus } from "../../../../../../../src/browser/stores/composer-focus.ts"
import type { StampedPendingAsk } from "../../../../../../../src/shared/session-driver/pending-ask.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { putSession } from "../../../../../session-store.ts"

/** 札の中の Esc が入力欄へフォーカスを戻す規則だけを測る。 */

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

const PERMISSION_PENDING = {
  kind: "permission",
  id: "ask-perm",
  toolName: "Bash",
  input: { command: "echo 架空" },
  askedAt: 0,
} satisfies StampedPendingAsk

const QUESTION_PENDING = {
  kind: "question",
  id: "ask-1",
  questions: [
    {
      header: "架空の選択",
      text: "架空の質問",
      multiSelect: false,
      options: [{ label: "A案", description: "架空の説明", preview: undefined }],
    },
  ],
  briefs: [],
  imageSizes: [],
  unshelvedImages: [],
  askedAt: 0,
} satisfies StampedPendingAsk

function renderInquiry(pending: readonly StampedPendingAsk[]): void {
  putSession({ ...INITIAL_SESSION_STATE, pending })
  render(<Inquiry />)
}

function focusSignal(): number {
  return useComposerFocus.getState().signal
}

describe("お伺いの札の Esc", () => {
  it("札の中で Esc を押すと入力欄へフォーカスを戻す合図を出す", () => {
    renderInquiry([PERMISSION_PENDING])
    const before = focusSignal()

    fireEvent.keyDown(screen.getByRole("region", { name: "お伺い" }), { key: "Escape" })

    expect(focusSignal()).toBe(before + 1)
  })

  it("修飾キーつきと、重なる面が開いているときは出さない", () => {
    renderInquiry([PERMISSION_PENDING])
    const card = screen.getByRole("region", { name: "お伺い" })
    const before = focusSignal()

    fireEvent.keyDown(card, { key: "Escape", metaKey: true })
    fireEvent.keyDown(card, { key: "Escape", shiftKey: true })
    const release = acquireOverlay()
    fireEvent.keyDown(card, { key: "Escape" })
    release()

    expect(focusSignal()).toBe(before)
  })

  it("広げた板の中の Esc は、入力欄へ戻さず板を閉じる側に任せる", () => {
    renderInquiry([QUESTION_PENDING])
    fireEvent.click(screen.getByRole("button", { name: "広げる" }))
    const board = screen.getByRole("dialog", { name: "お伺い（広げた板）" })
    const before = focusSignal()

    fireEvent.keyDown(within(board).getByRole("radio", { name: /A案/ }), { key: "Escape" })

    expect(focusSignal()).toBe(before)
  })
})
