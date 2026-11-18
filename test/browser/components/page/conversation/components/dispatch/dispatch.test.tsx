import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Dispatch } from "../../../../../../../src/browser/components/page/conversation/components/dispatch/dispatch.tsx"
import { useComposerDraft } from "../../../../../../../src/browser/components/page/conversation/stores/composer-draft.ts"
import { useInquiryDraft } from "../../../../../../../src/browser/components/page/conversation/stores/inquiry-draft.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../src/shared/session/session-state.ts"
import { requestRecord, workPlanRecord } from "../../../../../../fixture/session-record.ts"
import { createTestQueryClient } from "../../../../../query-client.tsx"
import { putSession } from "../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  // 組み立て中の答えはモジュール単位で残るので、次のテストへ持ち越さない。
  useInquiryDraft.setState(useInquiryDraft.getInitialState(), true)
  useComposerDraft.setState(useComposerDraft.getInitialState(), true)
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
      pending: [{ kind: "permission", id: "ask-1", toolName: "Bash", input: {}, askedAt: 0 }],
    })

    expect(document.title).toBe("● tsukumo")
  })

  it("作業中でワークプランがあれば、印の後ろに位置と今のフェーズの名前を足す", () => {
    document.title = "tsukumo"
    renderDispatch({
      turn: { kind: "running", startedAt: 0 },
      records: [requestRecord(), workPlanRecord({ current: 1 })],
    })

    expect(document.title).toBe("… 2/2 架空の段B · tsukumo")
  })

  it("ワークプランの無い作業中は印だけ", () => {
    document.title = "tsukumo"
    renderDispatch({ turn: { kind: "running", startedAt: 0 }, records: [requestRecord()] })

    expect(document.title).toBe("… tsukumo")
  })

  it("雑談モードでは位置もフェーズの名前も足さない", () => {
    document.title = "tsukumo"
    renderDispatch({
      chatMode: true,
      turn: { kind: "running", startedAt: 0 },
      records: [requestRecord(), workPlanRecord({ current: 1 })],
    })

    expect(document.title).toBe("tsukumo")
  })
})
