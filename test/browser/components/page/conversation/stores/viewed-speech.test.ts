import { act } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { LATEST_VIEWED_SPEECH } from "../../../../../../src/browser/components/page/conversation/domain/pinned-speech.ts"
import { useViewedSpeech } from "../../../../../../src/browser/components/page/conversation/stores/viewed-speech.ts"
import type { SessionRecord } from "../../../../../../src/shared/session/session-record.ts"
import {
  reactionRecord,
  requestRecord,
  speechRecord,
} from "../../../../../fixture/session-record.ts"
import { advanceState, putSession, stateWith } from "../../../../session-store.ts"

function stateWithRecords(...records: SessionRecord[]) {
  return stateWith({ records })
}

const BASE = [
  requestRecord({ text: "古い依頼", turnId: 0 }),
  speechRecord({ text: "古いセリフ" }),
  requestRecord({ text: "新しい依頼", turnId: 1 }),
  speechRecord({ text: "1件目" }),
]

function pinnedTurnIndex(): readonly [number, number] | undefined {
  const { viewed } = useViewedSpeech.getState()
  return viewed.kind === "pinned" ? [viewed.turnId, viewed.index] : undefined
}

describe("useViewedSpeech", () => {
  beforeEach(() => {
    window.location.hash = ""
    putSession(stateWithRecords(...BASE))
    act(() => {
      useViewedSpeech.setState({ viewed: LATEST_VIEWED_SPEECH })
    })
  })

  afterEach(() => {
    window.location.hash = ""
  })

  it("toggle で留まり、同じ行をもう一度押すと最新へ戻る", () => {
    act(() => useViewedSpeech.getState().toggle(0, 0))
    expect(pinnedTurnIndex()).toEqual([0, 0])

    act(() => useViewedSpeech.getState().toggle(0, 0))
    expect(useViewedSpeech.getState().viewed).toBe(LATEST_VIEWED_SPEECH)
  })

  it("いちばん新しいやり取りに speech か reaction が届くと最新へ戻る", () => {
    act(() => useViewedSpeech.getState().toggle(0, 0))
    act(() => advanceState(stateWithRecords(...BASE, reactionRecord({ text: "反応" }))))

    expect(useViewedSpeech.getState().viewed).toBe(LATEST_VIEWED_SPEECH)
  })

  it("見ているやり取りが替わる hashchange で最新へ戻り、元へ戻しても留まっていない", async () => {
    act(() => useViewedSpeech.getState().toggle(0, 0))

    await changeHash("#?turn=0")
    expect(useViewedSpeech.getState().viewed).toBe(LATEST_VIEWED_SPEECH)

    await changeHash("")
    expect(useViewedSpeech.getState().viewed).toBe(LATEST_VIEWED_SPEECH)
  })

  it("画面だけが替わる hash では解けない", async () => {
    act(() => useViewedSpeech.getState().toggle(0, 0))

    await changeHash("#character")

    expect(pinnedTurnIndex()).toEqual([0, 0])
  })
})

function changeHash(hash: string): Promise<void> {
  return act(async () => {
    window.location.hash = hash
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}
