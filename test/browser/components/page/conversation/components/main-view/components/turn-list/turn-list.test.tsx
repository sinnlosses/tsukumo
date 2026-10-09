import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { TurnList } from "../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/turn-list/turn-list.tsx"
import { readHashRoute } from "../../../../../../../../../src/browser/stores/location-hash.ts"
import { useNavDrawer } from "../../../../../../../../../src/browser/stores/nav-drawer.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionRecord,
  type SessionState,
} from "../../../../../../../../../src/shared/session/session-state.ts"
import {
  reportRecord,
  requestRecord,
  speechRecord,
} from "../../../../../../../../fixture/session-record.ts"
import { putSession } from "../../../../../../../session-store.ts"

// フィクスチャはすべて手で書いた架空の依頼とレポート（実物の会話は使わない）。

afterEach(() => {
  cleanup()
  useNavDrawer.setState(useNavDrawer.getInitialState(), true)
  window.location.hash = ""
})

const STARTED_AT = Temporal.Instant.from("2026-01-02T19:10:00Z").epochMilliseconds

/** 済んだやり取り2件（どちらも依頼とレポート）。 */
const TWO_DONE_TURNS: readonly SessionRecord[] = [
  requestRecord({
    turnId: 0,
    text: "架空の1件目の依頼",
    time: { kind: "stamped", at: STARTED_AT },
  }),
  speechRecord({ time: { kind: "stamped", at: STARTED_AT + 6 * 60_000 } }),
  reportRecord("架空の1件目の結論"),
  requestRecord({
    turnId: 1,
    text: "架空の2件目の依頼",
    time: { kind: "stamped", at: STARTED_AT + 20 * 60_000 },
  }),
  speechRecord({ time: { kind: "stamped", at: STARTED_AT + 20 * 60_000 + 23_000 } }),
  reportRecord("架空の2件目の結論"),
]

function renderTurnList(state: Partial<SessionState>): void {
  putSession({ ...INITIAL_SESSION_STATE, ...state })
  render(<TurnList />)
}

function rows(): readonly HTMLElement[] {
  return within(screen.getByRole("list")).getAllByRole("button")
}

describe("TurnList", () => {
  it("やり取りを古い順に並べ、済んだ行は ✓ と「開始の時刻　所要」を出す", () => {
    renderTurnList({ records: TWO_DONE_TURNS })

    expect(rows().map((row) => row.getAttribute("aria-label"))).toEqual([
      "完了: 架空の1件目の依頼",
      "完了: 架空の2件目の依頼",
    ])
    expect(rows().map((row) => row.querySelector(".turn-list-mark")?.textContent)).toEqual([
      "✓",
      "✓",
    ])
    expect(rows().map((row) => row.querySelector(".turn-list-span")?.textContent)).toEqual([
      "19:10　6分",
      "19:30　23秒",
    ])
    expect(rows()[1]?.getAttribute("aria-current")).toBe("true")
  })

  it("経過を数えているあいだの最新の行は回る輪で、2行目は「作業中 <経過>」", () => {
    const startedAt = Temporal.Now.instant().epochMilliseconds - 65_000
    renderTurnList({
      records: [requestRecord({ turnId: 0, text: "架空の作業中の依頼" })],
      turn: { kind: "running", startedAt },
      bodiesInTurn: { report: true, utterance: true },
    })

    const [row] = rows()
    expect(row?.className).toContain("is-working")
    expect(row?.querySelector(".turn-list-spinner")).not.toBeNull()
    expect(row?.querySelector(".turn-list-span")?.textContent).toMatch(/^作業中 1:0[5-7]$/u)
  })

  it("行を押すと引き出しを閉じ、そのやり取りに留める", () => {
    renderTurnList({ records: TWO_DONE_TURNS })
    act(() => {
      useNavDrawer.getState().openDrawer()
    })

    fireEvent.click(rows()[0] ?? document.body)

    expect(useNavDrawer.getState().open).toBe(false)
    expect(readHashRoute().turn).toBe(0)
    expect(readHashRoute().screen).toBe("conversation")
  })

  it("ほかの画面で行を押すと、会話の画面へ移る。最新の行なら追従に戻す", () => {
    window.location.hash = "#token-usage"
    renderTurnList({ records: TWO_DONE_TURNS })

    fireEvent.click(rows()[1] ?? document.body)

    expect(readHashRoute().screen).toBe("conversation")
    expect(readHashRoute().turn).toBe("newest")
  })

  it("やり取りが無ければ一言だけ出す", () => {
    renderTurnList({ records: [] })

    expect(screen.getByText("まだやり取りは無い")).toBeDefined()
  })
})
