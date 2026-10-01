import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Dispatch } from "../../../../../../../src/browser/components/page/conversation/components/dispatch/dispatch.tsx"
import { useQuestionDraft } from "../../../../../../../src/browser/stores/question-answer.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../src/shared/session/session-state.ts"
import { createTestQueryClient } from "../../../../../query-client.tsx"
import { putSession } from "../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  // 組み立て中の答えはモジュール単位で残るので、次のテストへ持ち越さない。
  useQuestionDraft.setState(useQuestionDraft.getInitialState(), true)
  document.title = "tsukumo"
})

function renderDispatch(stateOverrides: Partial<SessionState>): void {
  putSession({ ...INITIAL_SESSION_STATE, ...stateOverrides })
  // 中の `<Composer>` が `@` 補完の一覧を `useQuery` で取るので Provider が要る
  // （この検査では取りに行かないが、hook そのものは呼ばれる）。
  const client = createTestQueryClient()
  render(
    <QueryClientProvider client={client}>
      <Dispatch />
    </QueryClientProvider>,
  )
}

describe("Dispatch", () => {
  it("答え待ちが無いときはタブのタイトルをそのまま保つ", () => {
    document.title = "tsukumo"
    renderDispatch({ pending: [] })

    expect(document.title).toBe("tsukumo")
  })

  it("答え待ちがあるとタブのタイトルの先頭に「● 」を付ける", () => {
    document.title = "tsukumo"
    renderDispatch({
      pending: [{ kind: "permission", id: "ask-1", toolName: "Bash", input: {} }],
    })

    expect(document.title).toBe("● tsukumo")
  })
})
