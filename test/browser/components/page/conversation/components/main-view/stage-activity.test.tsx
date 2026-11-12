import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { StageActivity } from "../../../../../../../src/browser/components/page/conversation/components/main-view/stage-activity.tsx"
import { applySessionEvent } from "../../../../../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { requestEvent } from "../../../../../../fixture/session-event.ts"
import { checkedToolUseId } from "../../../../../../fixture/tool-use-id.ts"
import { putSession } from "../../../../../session-store.ts"

afterEach(() => {
  cleanup()
})

const STARTED = applySessionEvent(
  applySessionEvent(INITIAL_SESSION_STATE, requestEvent(), 0),
  {
    kind: "tool-started",
    toolUseId: checkedToolUseId("toolu_1"),
    name: "Bash",
    input: { command: "架空のコマンド" },
    parentToolUseId: undefined,
  },
  1,
)

describe("StageActivity", () => {
  it("走っている手順があれば「手元」の行を出す", () => {
    putSession(STARTED)
    render(<StageActivity />)

    expect(screen.getByText("手元")).toBeTruthy()
    expect(screen.getByText(/架空のコマンド/u)).toBeTruthy()
    expect(document.querySelector("p")?.getAttribute("data-tone")).toBe("quiet")
  })

  it("答え待ちのときは「待ち」の行を出し、「手元」は出さない", () => {
    putSession({
      ...STARTED,
      pending: [{ kind: "permission", id: "ask-1", toolName: "Read", input: {}, askedAt: 0 }],
    })
    render(<StageActivity />)

    expect(screen.getByText("待ち")).toBeTruthy()
    expect(screen.queryByText("手元")).toBeNull()
    expect(screen.getByText(/お伺いが届いた/u)).toBeTruthy()
    expect(document.querySelector("p")?.getAttribute("data-tone")).toBe("asking")
  })

  it("ターンが無ければ何も出さない", () => {
    putSession(INITIAL_SESSION_STATE)
    const { container } = render(<StageActivity />)

    expect(container.textContent).toBe("")
  })
})
