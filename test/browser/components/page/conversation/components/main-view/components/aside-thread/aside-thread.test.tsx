import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { AsideThread } from "../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/aside-thread/aside-thread.tsx"
import type { MainViewAside } from "../../../../../../../../../src/shared/session/main-view.ts"
import { putState, putSession, stateWith } from "../../../../../../../session-store.ts"

afterEach(() => {
  cleanup()
})

const ASIDES: readonly MainViewAside[] = [
  { text: "架空の問い", answer: { kind: "answered", text: "架空の答え" } },
  { text: "架空の頼み", answer: { kind: "waiting" } },
]

const DELEGATING = stateWith({
  turn: { kind: "finished", startedAt: 0, finishedAt: 1, ending: { kind: "ended" } },
  backgroundTasks: [{ taskId: "fictional-task", kind: "agent", description: "架空の委譲" }],
})

function details(): HTMLDetailsElement {
  const element = screen.getByText(/^脇の話 2件/).closest("details")
  if (element === null) {
    throw new Error("欄が無い")
  }
  return element
}

describe("AsideThread", () => {
  it("言葉と答えを古い順に対で並べ、答えがまだ無ければ「…」を出す", () => {
    putSession(DELEGATING)
    render(<AsideThread asides={ASIDES} newest={true} />)

    expect(screen.getAllByRole("listitem").map((row) => row.textContent)).toEqual([
      "きみ: 架空の問い → 架空の答え",
      "きみ: 架空の頼み → …",
    ])
  })

  it("やり取りが開いているあいだは開き、閉じたら畳む。前のやり取りは初めから畳む", () => {
    putSession(DELEGATING)
    const { rerender } = render(<AsideThread asides={ASIDES} newest={true} />)
    expect(details().open).toBe(true)
    expect(details().querySelector("summary")?.textContent).toBe("脇の話 2件 ▾")

    act(() => {
      putState(stateWith({ backgroundTasks: [] }))
    })
    expect(details().open).toBe(false)
    expect(details().querySelector("summary")?.textContent).toBe("脇の話 2件 ▸")

    rerender(<AsideThread asides={ASIDES} newest={false} />)
    expect(details().open).toBe(false)
  })
})
