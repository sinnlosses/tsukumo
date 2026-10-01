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

function hold(on: boolean): void {
  act(() => {
    useMainViewContent.getState().setHold("focus", on)
  })
}

function content(): ReturnType<typeof useMainViewContent.getState>["content"] {
  return useMainViewContent.getState().content
}

describe("useMainViewContent", () => {
  it("依頼の前は迎える口、送ると地図、保留なしで閉じるとレポートへ進む", () => {
    putSession(INITIAL_SESSION_STATE)
    expect(content().kind).toBe("welcome")

    send()
    expect(content()).toMatchObject({ kind: "work-map", hold: { kind: "live" } })

    receive({ kind: "utterance", text: "架空のレポート" })
    finish()
    expect(content()).toMatchObject({ kind: "report", arrived: true })
  })

  it("保留しているあいだに閉じると、閉じる前のターンを持ったまま地図に残る", () => {
    putSession(INITIAL_SESSION_STATE)
    send()
    hold(true)
    receive({ kind: "utterance", text: "架空のレポート" })
    finish()

    const held = content()
    expect(held.kind === "work-map" && held.hold.kind === "held").toBe(true)
    if (held.kind === "work-map" && held.hold.kind === "held") {
      expect(held.hold.frozen.steps.every((step) => !step.final)).toBe(true)
    }
  })

  it("保留が解けても地図のまま。知らせを押すとレポートへ入れ替わる", () => {
    putSession(INITIAL_SESSION_STATE)
    send()
    hold(true)
    finish()
    hold(false)
    expect(content()).toMatchObject({ kind: "work-map", hold: { kind: "held" } })

    act(() => {
      useMainViewContent.getState().acceptHeldReport()
    })
    expect(content()).toMatchObject({ kind: "report", arrived: true })
  })

  it("保留して地図に残したまま次を送ると、新しい依頼の地図になる", () => {
    putSession(INITIAL_SESSION_STATE)
    send()
    hold(true)
    finish()
    expect(content()).toMatchObject({ kind: "work-map", exchange: 1, hold: { kind: "held" } })

    send("架空の次の依頼")
    expect(content()).toMatchObject({ kind: "work-map", exchange: 2, hold: { kind: "live" } })
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
