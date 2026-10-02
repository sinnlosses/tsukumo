import { act } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useMainViewContent } from "../../../src/browser/stores/main-view-content.ts"
import { useSession } from "../../../src/browser/stores/session.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { INITIAL_SESSION_STATE } from "../../../src/shared/session/session-state.ts"
import { requestRecord } from "../../fixture/session-record.ts"
import { putSession } from "../session-store.ts"

afterEach(() => {
  act(() => {
    useMainViewContent.setState(useMainViewContent.getInitialState(), true)
  })
})

function receive(...events: readonly SessionEvent[]): void {
  act(() => {
    useSession.getState().receive({
      type: "events",
      events: events.map((event) => ({ at: 0, event })),
    })
  })
}

function send(text = "架空の依頼"): void {
  receive({ kind: "request", text, images: [] })
}

function finish(): void {
  receive({ kind: "turn-finished", outcome: { kind: "completed" } })
}

function content(): ReturnType<typeof useMainViewContent.getState>["content"] {
  return useMainViewContent.getState().content
}

describe("useMainViewContent", () => {
  it("依頼の前は迎える口、送ると地図、閉じるとレポートへ進む", () => {
    putSession(INITIAL_SESSION_STATE)
    expect(content().kind).toBe("welcome")

    send()
    expect(content()).toMatchObject({ kind: "work-map" })

    receive({ kind: "utterance", text: "架空のレポート" })
    finish()
    expect(content()).toMatchObject({ kind: "report", arrived: true })
  })

  it("閉じたあとに続きのターンが始まっても、レポートのまま", () => {
    putSession(INITIAL_SESSION_STATE)
    send()
    finish()
    receive({ kind: "turn-resumed" })
    expect(content()).toMatchObject({ kind: "report" })
  })

  it("読み込んだ時点で閉じていたやり取りは、入れ替えを経ないレポート", () => {
    putSession({ ...INITIAL_SESSION_STATE, records: [requestRecord()], nextTurnId: 1 })
    expect(content()).toMatchObject({ kind: "report", arrived: false })
  })

  it("/clear で記録が空になると迎える口へ戻る", () => {
    putSession(INITIAL_SESSION_STATE)
    send()
    finish()
    receive({ kind: "conversation-cleared" })
    expect(content().kind).toBe("welcome")
  })
})
