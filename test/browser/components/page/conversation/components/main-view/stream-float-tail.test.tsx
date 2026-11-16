import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { TailReturnModel } from "../../../../../../../src/browser/components/page/conversation/components/main-view/hooks/use-tail-return.ts"
import { StreamFloat } from "../../../../../../../src/browser/components/page/conversation/components/main-view/stream-float.tsx"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { putSession } from "../../../../../session-store.ts"

afterEach(cleanup)

function renderFloat(tail: TailReturnModel): void {
  putSession(INITIAL_SESSION_STATE)
  render(
    <StreamFloat notice={{ kind: "none" }} viewingPast={false} onNotice={() => {}} tail={tail} />,
  )
}

describe("StreamFloat の「末尾へ」", () => {
  it("上へ送って読んでいるあいだ、新しい行の件数つきで出し、押すと末尾へ戻す", () => {
    let returned = 0
    renderFloat({
      tail: { kind: "away", unseen: 3 },
      onReturn: () => {
        returned += 1
      },
    })

    const button = screen.getByRole("button", { name: /末尾へ/ })
    expect(button.textContent).toContain("新しい行 3件")
    fireEvent.click(button)

    expect(returned).toBe(1)
  })

  it("新しい行がまだ無ければ件数を出さず、末尾にいるあいだは口を出さない", () => {
    renderFloat({ tail: { kind: "away", unseen: 0 }, onReturn: () => {} })
    expect(screen.getByRole("button", { name: "末尾へ" }).textContent).toBe("末尾へ")
    cleanup()

    renderFloat({ tail: { kind: "none" }, onReturn: () => {} })
    expect(screen.queryByRole("button", { name: /末尾へ/ })).toBeNull()
  })
})
