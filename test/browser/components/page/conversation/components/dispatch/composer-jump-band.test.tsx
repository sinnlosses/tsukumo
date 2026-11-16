import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Composer } from "../../../../../../../src/browser/components/page/conversation/components/dispatch/composer.tsx"
import { useFavorVisibility } from "../../../../../../../src/browser/components/page/conversation/stores/favor-visibility.ts"
import type { StampedPendingAsk } from "../../../../../../../src/shared/session-driver/pending-ask.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { createTestQueryClient } from "../../../../../query-client.tsx"
import { putSession } from "../../../../../session-store.ts"

const PERMISSION_PENDING = {
  kind: "permission",
  id: "ask-1",
  toolName: "Bash",
  input: {},
  askedAt: 0,
} satisfies StampedPendingAsk

const CONDITION_NOTE = "入力欄が空のとき ↑ でも移れます"

afterEach(() => {
  cleanup()
  useFavorVisibility.setState(useFavorVisibility.getInitialState(), true)
})

function renderComposer(pending: readonly StampedPendingAsk[]): void {
  putSession({ ...INITIAL_SESSION_STATE, pending })
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <Composer />
    </QueryClientProvider>,
  )
}

describe("入力欄の上の口", () => {
  it("お伺いの口は「選択肢へ」に ↑ の印を添え、入力欄が空のときという条件はツールチップと補足に置く", () => {
    renderComposer([PERMISSION_PENDING])

    const jump = screen.getByRole("button", { name: "選択肢へ" })

    expect(jump.textContent).toBe("選択肢へ↑")
    expect(jump.getAttribute("title")).toBe(CONDITION_NOTE)
    expect(jump.getAttribute("aria-description")).toBe(CONDITION_NOTE)
  })

  it("お願いの口は「お願いへ」に ↑ の印を添え、同じ条件をツールチップと補足に置く", () => {
    useFavorVisibility.getState().attach("favor-a")
    renderComposer([])

    const jump = screen.getByRole("button", { name: "お願いへ" })

    expect(jump.textContent).toBe("お願いへ↑")
    expect(jump.getAttribute("title")).toBe(CONDITION_NOTE)
    expect(jump.getAttribute("aria-description")).toBe(CONDITION_NOTE)
  })
})
