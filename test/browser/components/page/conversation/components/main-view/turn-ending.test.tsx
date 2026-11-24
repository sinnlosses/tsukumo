import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useComposerDraft } from "../../../../../../../src/browser/components/page/conversation/stores/composer-draft.ts"
import type { MainViewReportBody } from "../../../../../../../src/shared/session/main-view-shape.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { bodyTextOf } from "../../../../../../fixture/main-view-entry.ts"
import { requestRecord } from "../../../../../../fixture/session-record.ts"
import { TURN_ID, turn } from "../../../../../../fixture/turn.ts"
import { putSession } from "../../../../../session-store.ts"

vi.mock("../../../../../../../src/browser/features/report/report.tsx", () => ({
  Report: (props: { readonly body: MainViewReportBody }) => <div>{bodyTextOf(props.body)}</div>,
}))

const { Turn } =
  await import("../../../../../../../src/browser/components/page/conversation/components/main-view/turn.tsx")

afterEach(() => {
  cleanup()
  useComposerDraft.setState(useComposerDraft.getInitialState(), true)
})

describe("Turn（失敗で終わったやり取り）", () => {
  it("本文が1つも無いまま失敗したやり取りでも、失敗の表示は出す", () => {
    putSession({
      ...INITIAL_SESSION_STATE,
      records: [
        requestRecord({ turnId: TURN_ID }),
        { kind: "turn-failure", failure: { kind: "max-turns" } },
      ],
    })
    render(
      <Turn
        turn={{ ...turn([]), failure: { kind: "failed", failure: { kind: "max-turns" } } }}
        newest={false}
        freshReport={false}
      />,
    )

    const note = screen.getByRole("note", { name: "失敗で終わった" })
    expect(note.textContent).toContain("往復の上限に当たった")
    expect(note.textContent).not.toContain("max-turns")
    expect(note.textContent).not.toContain("失敗で終わった")
    expect(screen.getByTitle("失敗で終わった: 往復の上限に当たった（max-turns）")).toBeTruthy()
  })

  it("利用者が止めたやり取りには「止めた」と、続きを頼む文を入れる口が出て、押しても送らない", () => {
    putSession({
      ...INITIAL_SESSION_STATE,
      records: [requestRecord({ turnId: TURN_ID }), { kind: "turn-interrupted" }],
    })
    render(
      <Turn turn={{ ...turn([]), failure: { kind: "interrupted" } }} newest freshReport={false} />,
    )

    const note = screen.getByRole("note", { name: "止めた" })
    expect(note.textContent).toContain("止めた")

    fireEvent.click(screen.getByRole("button", { name: "続きを頼む文を入力欄に入れる" }))

    expect(useComposerDraft.getState().draft.text).toBe("続きをお願いします。")
  })

  it("利用上限で終わったやり取りの戻る時刻つきの口を押すと、依頼が入力欄の下書きに入る", () => {
    putSession({
      ...INITIAL_SESSION_STATE,
      records: [
        requestRecord({ turnId: TURN_ID }),
        { kind: "turn-failure", failure: { kind: "api-error", error: "rate_limit" } },
      ],
      rateLimit: {
        kind: "rejected",
        bucket: "five-hour",
        resetsAt: Temporal.Now.instant().add({ hours: 1 }).epochMilliseconds,
      },
    })
    render(
      <Turn
        turn={{
          ...turn([]),
          failure: { kind: "failed", failure: { kind: "api-error", error: "rate_limit" } },
        }}
        newest
        freshReport={false}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /に戻る · 依頼を入力欄に戻す$/ }))

    expect(useComposerDraft.getState().draft.text).toBe("架空の依頼")
  })
})
