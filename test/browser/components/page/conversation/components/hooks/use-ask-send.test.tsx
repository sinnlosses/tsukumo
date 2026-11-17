import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useAskSend } from "../../../../../../../src/browser/components/page/conversation/components/hooks/use-ask-send.ts"
import { useSession } from "../../../../../../../src/browser/stores/session.ts"
import type { ReplyTarget } from "../../../../../../../src/shared/session/reply-target.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../src/shared/session/session-state.ts"
import { putSession, type SentCommand } from "../../../../../session-store.ts"

afterEach(() => {
  cleanup()
})

const TARGET: ReplyTarget = {
  label: { component: "架空の表" },
  key: { reportToolUseId: "toolu_1", componentId: "t1" },
}

function setup(overrides: Partial<SessionState> = {}) {
  const calls: SentCommand[] = []
  putSession({ ...INITIAL_SESSION_STATE, ...overrides }, (command) => {
    calls.push(command)
  })
  const { result } = renderHook(() => useAskSend())
  return { calls, result }
}

describe("useAskSend", () => {
  it("つながっていれば、指した所つきの補足メッセージ（送り方 ask）として送る", async () => {
    const { calls, result } = setup()

    await act(async () => {
      await result.current(TARGET, "架空の問い")
    })

    expect(calls).toEqual([
      {
        procedure: "session.prompt",
        text: "架空の問い",
        images: [],
        routing: "ask",
        target: TARGET,
      },
    ])
  })

  it("つながっていないときは送らない", async () => {
    const { calls, result } = setup()
    act(() => {
      useSession.getState().setConnection("closed")
    })

    await act(async () => {
      await result.current(TARGET, "架空の問い")
    })

    expect(calls).toEqual([])
  })

  it("会話が終わったあとは送らない", async () => {
    const { calls, result } = setup({ endedReason: "架空の理由" })

    await act(async () => {
      await result.current(TARGET, "架空の問い")
    })

    expect(calls).toEqual([])
  })
})
