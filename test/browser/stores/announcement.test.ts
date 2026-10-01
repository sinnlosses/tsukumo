import { act } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useAnnouncement } from "../../../src/browser/stores/announcement.ts"
import { useSession } from "../../../src/browser/stores/session.ts"
import { INITIAL_SESSION_STATE } from "../../../src/shared/session/session-state.ts"
import { putSession, putState } from "../session-store.ts"

afterEach(() => {
  act(() => {
    useAnnouncement.setState(useAnnouncement.getInitialState(), true)
  })
})

function receiveRequest(): void {
  act(() => {
    useSession.getState().receive({
      type: "events",
      events: [{ at: 0, event: { kind: "request", text: "架空の依頼", images: [] } }],
    })
  })
}

describe("useAnnouncement", () => {
  it("姿が進んで読むものができたときだけ積む", () => {
    putSession(INITIAL_SESSION_STATE)
    expect(useAnnouncement.getState().batch.texts).toEqual([])

    receiveRequest()
    const { batch } = useAnnouncement.getState()
    expect(batch.texts).toEqual(["作業を始めた"])

    act(() => {
      useSession.getState().receive({ type: "events", events: [] })
    })
    expect(useAnnouncement.getState().batch).toBe(batch)
  })

  it("`hello` で姿が入れ替わっても読まない", () => {
    putSession(INITIAL_SESSION_STATE)
    receiveRequest()
    const { batch } = useAnnouncement.getState()

    act(() => {
      putState(INITIAL_SESSION_STATE)
    })
    expect(useAnnouncement.getState().batch).toBe(batch)
  })
})
