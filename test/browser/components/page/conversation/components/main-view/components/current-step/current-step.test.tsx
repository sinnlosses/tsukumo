import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { CurrentStep } from "../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/current-step/current-step.tsx"
import type { SessionEvent } from "../../../../../../../../../src/shared/session/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../../../src/shared/session/session-state.ts"
import { putSession } from "../../../../../../../session-store.ts"

afterEach(() => {
  cleanup()
})

const REQUEST: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }

function plan(current: number): SessionEvent {
  return {
    kind: "work-plan",
    delegatedRange: { kind: "none" },
    phases: ["架空の段A", "架空の段B", "架空の段C"],
    current,
    finishedInGroup: [],
    phaseSummary: "",
  }
}

function stateAfter(events: readonly SessionEvent[]): SessionState {
  return events.reduce(
    (state, event, index) => applySessionEvent(state, event, index),
    INITIAL_SESSION_STATE,
  )
}

describe("CurrentStep", () => {
  it("段取りがあれば「いまの段 · n 題」を出し、走っている手順を1行で出す", () => {
    putSession(
      stateAfter([
        REQUEST,
        plan(1),
        {
          kind: "tool-started",
          toolUseId: "toolu_1",
          name: "Bash",
          input: { command: "架空のコマンド" },
          parentToolUseId: undefined,
        },
      ]),
    )
    render(<CurrentStep />)

    expect(screen.getByRole("heading", { name: "いまの段 · 2 架空の段B" })).toBeTruthy()
    expect(screen.getByText(/Bash\s+架空のコマンド/u)).toBeTruthy()
  })

  it("API の再試行中はその1行に何回目かを出す", () => {
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
    render(<CurrentStep />)

    expect(screen.getByText(/再試行中 2\/10/u)).toBeTruthy()
  })

  it("答え待ちのときはその1行がお伺いの届いたことを言う", () => {
    putSession({
      ...stateAfter([REQUEST, plan(0)]),
      pending: [{ kind: "permission", id: "ask-1", toolName: "Read", input: {}, askedAt: 0 }],
    })
    render(<CurrentStep />)

    expect(screen.getByText(/お伺いが届いた/u)).toBeTruthy()
  })

  it("段取りが無いときは見出しを「いまの段」だけにする", () => {
    putSession(stateAfter([REQUEST]))
    render(<CurrentStep />)

    expect(screen.getByRole("heading", { name: "いまの段" })).toBeTruthy()
  })
})
