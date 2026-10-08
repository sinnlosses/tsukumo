import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { WorkStrip } from "../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/work-strip/work-strip.tsx"
import { useWorkStripSteps } from "../../../../../../../../../src/browser/stores/work-strip-steps.ts"
import type { SessionEvent } from "../../../../../../../../../src/shared/session/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../../../src/shared/session/session-state.ts"
import { putSession } from "../../../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  useWorkStripSteps.setState(useWorkStripSteps.getInitialState(), true)
})

const REQUEST: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }

function plan(current: number): SessionEvent {
  return {
    kind: "work-plan",
    phases: ["架空の段A", "架空の段B", "架空の段C"],
    current,
    finishedInGroup: [],
    phaseSummary: "",
  }
}

function bashStarted(id: string): SessionEvent {
  return {
    kind: "tool-started",
    toolUseId: id,
    name: "Bash",
    input: { command: `架空のコマンド ${id}` },
    parentToolUseId: undefined,
  }
}

function bashFinished(id: string): SessionEvent {
  return { kind: "tool-finished", toolUseId: id, content: "架空の結果", isError: false }
}

function stateAfter(events: readonly SessionEvent[]): SessionState {
  return events.reduce(
    (state, event, index) => applySessionEvent(state, event, index),
    INITIAL_SESSION_STATE,
  )
}

function strip(): HTMLElement {
  return screen.getByRole("region", { name: "進み具合" })
}

describe("WorkStrip", () => {
  it("「手順 n」を押すと段ごとに区切った一覧が帯の下に開き、もう一度押すと閉じる", () => {
    putSession(
      stateAfter([
        REQUEST,
        plan(0),
        bashStarted("toolu_1"),
        bashFinished("toolu_1"),
        plan(1),
        bashStarted("toolu_2"),
      ]),
    )
    render(<WorkStrip />)
    const toggle = screen.getByRole("button", { name: /^手順 2/ })

    act(() => {
      fireEvent.click(toggle)
    })
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    const list = screen.getByRole("region", { name: "依頼の手順" })
    expect(list.textContent).toContain("1/3 架空の段A")
    expect(list.textContent).toContain("2/3 架空の段B")

    act(() => {
      fireEvent.click(toggle)
    })
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByRole("region", { name: "依頼の手順" })).toBeNull()
  })

  it("API の再試行は帯の2行目に何回目かを出す", () => {
    putSession(
      stateAfter([
        REQUEST,
        plan(0),
        {
          kind: "api-retry",
          retry: {
            attempt: 2,
            maxRetries: 10,
            retryDelayMs: 3000,
            errorStatus: 529,
            error: "overloaded",
          },
        },
      ]),
    )
    render(<WorkStrip />)

    expect(strip().getAttribute("data-work-strip")).toBe("working")
    expect(strip().querySelector("[data-result]")?.textContent).toBe("作業中")
    expect(strip().querySelector("p")?.textContent).toContain("再試行中 2/10")
  })

  it("ターンが閉じると帯は済んだ姿の1行で残り、段の数だけ済んだと言う", () => {
    putSession(
      stateAfter([
        REQUEST,
        plan(0),
        bashStarted("toolu_1"),
        bashFinished("toolu_1"),
        plan(3),
        { kind: "turn-finished", outcome: { kind: "completed" } },
      ]),
    )
    render(<WorkStrip />)

    expect(strip().getAttribute("data-work-strip")).toBe("finished")
    expect(strip().textContent).toContain("3段すべて済み")
    const chip = strip().querySelector("[data-result]")
    expect(chip?.getAttribute("data-result")).toBe("done")
    expect(chip?.textContent).toBe("完了")
    expect(chip?.querySelector("[aria-hidden]")?.textContent).toBe("")
    expect(strip().querySelector("p")).toBeNull()
  })
})
