import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, renderHook } from "@testing-library/react"
import { type ReactElement, type ReactNode } from "react"

import { usePendingAnswer } from "../../../../../../src/browser/components/page/conversation/dispatch/hooks/use-pending-answer.ts"
import { SessionStoreContext } from "../../../../../../src/browser/stores/session.tsx"
import { type PendingAsk } from "../../../../../../src/shared/pending-ask.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../src/shared/session-state.ts"
import { type CommandSpy, sessionStoreWith } from "../../../../session-store.ts"

/**
 * 答え待ちの箱（`<PendingAnswer>`）を描かずに、答え待ちの先頭の畳み方と許可要求の送り先だけを
 * 測る（docs/design.md 2章「機能の中を分ける」）。質問は箱に出ない（札はメインビュー。
 * `test/browser/stores/question-answer.test.tsx`）。
 * フィクスチャはすべて手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。
 */

afterEach(() => {
  cleanup()
})

function wrapperFor(
  pending: readonly PendingAsk[],
  spy: CommandSpy,
): (props: { readonly children: ReactNode }) => ReactElement {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, pending }, spy)
  return function Wrapper({ children }: { readonly children: ReactNode }): ReactElement {
    return <SessionStoreContext.Provider value={store}>{children}</SessionStoreContext.Provider>
  }
}

const QUESTION: PendingAsk = {
  kind: "question",
  id: "ask-1",
  questions: [
    {
      header: "架空の選択",
      text: "架空の質問",
      multiSelect: false,
      options: [{ label: "A案", description: "架空の説明A", preview: undefined }],
    },
  ],
}

describe("usePendingAnswer", () => {
  it("答え待ちが無ければ none。質問も none（箱には出ない）", () => {
    const none = renderHook(() => usePendingAnswer(), { wrapper: wrapperFor([], () => {}) })
    expect(none.result.current.kind).toBe("none")

    const asked = renderHook(() => usePendingAnswer(), {
      wrapper: wrapperFor([QUESTION], () => {}),
    })
    expect(asked.result.current).toEqual({ kind: "none" })
  })

  it("許可要求は要約を「: 」付きで畳み、許可・拒否をそれぞれ answer として送る", () => {
    const calls: unknown[] = []
    const { result } = renderHook(() => usePendingAnswer(), {
      wrapper: wrapperFor(
        [{ kind: "permission", id: "ask-1", toolName: "Bash", input: { command: "echo dummy" } }],
        (command) => calls.push(command),
      ),
    })
    const model = result.current
    if (model.kind !== "permission") {
      throw new Error("許可要求になっていない")
    }

    expect(model.toolName).toBe("Bash")
    expect(model.summaryText).toBe(": echo dummy")
    model.onAllow()
    model.onDeny()

    expect(calls).toEqual([
      { procedure: "session.answer", id: "ask-1", answer: { kind: "allow" } },
      { procedure: "session.answer", id: "ask-1", answer: { kind: "deny" } },
    ])
  })

  it("要約が空なら後ろに何も続けない", () => {
    const { result } = renderHook(() => usePendingAnswer(), {
      wrapper: wrapperFor(
        [{ kind: "permission", id: "ask-1", toolName: "Bash", input: {} }],
        () => {},
      ),
    })

    expect(result.current.kind === "permission" ? result.current.summaryText : undefined).toBe("")
  })
})
