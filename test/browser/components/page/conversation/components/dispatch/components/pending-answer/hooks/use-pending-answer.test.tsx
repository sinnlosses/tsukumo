import { cleanup, renderHook } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { usePendingAnswer } from "../../../../../../../../../../src/browser/components/page/conversation/components/dispatch/components/pending-answer/hooks/use-pending-answer.ts"
import type { PendingAsk } from "../../../../../../../../../../src/shared/session-driver/pending-ask.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../../../../src/shared/session/session-state.ts"
import { putSession } from "../../../../../../../../session-store.ts"

afterEach(() => {
  cleanup()
})

function wrapperFor(
  pending: readonly PendingAsk[],
): (props: { readonly children: ReactNode }) => ReactElement {
  putSession({ ...INITIAL_SESSION_STATE, pending }, () => {})
  return function Wrapper({ children }: { readonly children: ReactNode }): ReactElement {
    return <>{children}</>
  }
}

describe("usePendingAnswer", () => {
  it("要約が空なら後ろに何も続けない", () => {
    const { result } = renderHook(() => usePendingAnswer(), {
      wrapper: wrapperFor([{ kind: "permission", id: "ask-1", toolName: "Bash", input: {} }]),
    })

    expect(result.current.kind === "permission" ? result.current.summaryText : undefined).toBe("")
  })
})
