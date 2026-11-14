import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Composer } from "../../../../../../../src/browser/components/page/conversation/components/dispatch/composer.tsx"
import type { StampedPendingAsk } from "../../../../../../../src/shared/session-driver/pending-ask.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { typedElement } from "../../../../../../typed-element.ts"
import { createTestQueryClient } from "../../../../../query-client.tsx"
import { putSession } from "../../../../../session-store.ts"

const QUESTION_PENDING = {
  kind: "question",
  id: "ask-question",
  questions: [
    {
      header: "架空の選択",
      text: "架空の質問",
      multiSelect: false,
      options: [{ label: "A案", description: "架空の説明A", preview: undefined }],
    },
  ],
  briefs: [],
  imageSizes: [],
  unshelvedImages: [],
  askedAt: 0,
} satisfies StampedPendingAsk

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
})

function renderComposer(): void {
  putSession({
    ...INITIAL_SESSION_STATE,
    pending: [QUESTION_PENDING],
    turn: { kind: "running", startedAt: 0 },
  })
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <Composer progress={{ kind: "paper", lamps: undefined }} />
    </QueryClientProvider>,
  )
}

describe("入力欄のモデル・effort・許可モードの札", () => {
  it("広い幅では、ターン中（答え待ち）でも札が押せる", () => {
    renderComposer()

    const models = screen.getAllByRole("combobox", { name: /^モデル / })
    expect(models).toHaveLength(1)
    expect(screen.getAllByRole("combobox", { name: /^許可モード / })).toHaveLength(1)
    for (const select of screen.getAllByRole("combobox")) {
      expect(typedElement(select, HTMLSelectElement, "札の <select>").disabled).toBe(false)
    }
  })

  it("狭い幅では札を描かない", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }))
    renderComposer()

    expect(screen.queryByRole("combobox", { name: /^モデル / })).toBeNull()
    expect(screen.queryByRole("combobox", { name: /^許可モード / })).toBeNull()
  })
})
