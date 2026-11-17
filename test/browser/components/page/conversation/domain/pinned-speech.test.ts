import { describe, expect, it } from "vitest"

import {
  expiredViewedSpeech,
  LATEST_VIEWED_SPEECH,
  pinAnchorOf,
  toggledViewedSpeech,
  type ViewedSpeech,
} from "../../../../../../src/browser/components/page/conversation/domain/pinned-speech.ts"
import { turnSpeeches } from "../../../../../../src/shared/session/turn-speech.ts"
import {
  reactionRecord,
  requestRecord,
  speechRecord,
} from "../../../../../fixture/session-record.ts"

describe("expiredViewedSpeech", () => {
  const records = [
    requestRecord({ text: "古い依頼", turnId: 0 }),
    speechRecord({ text: "古いセリフ" }),
    requestRecord({ text: "新しい依頼", turnId: 1 }),
    speechRecord({ text: "1件目" }),
  ]
  const turns = turnSpeeches(records)

  function pinnedAt(turnId: number): ViewedSpeech {
    return toggledViewedSpeech(LATEST_VIEWED_SPEECH, turnId, 0, pinAnchorOf(turns, "newest"))
  }

  it("何も変わらなければ留めたまま", () => {
    const viewed = pinnedAt(1)

    expect(expiredViewedSpeech(viewed, turns, "newest")).toBe(viewed)
  })

  it("いちばん新しいやり取りにセリフか反応が届くと最新へ戻る", () => {
    const grown = turnSpeeches([...records, reactionRecord({ text: "反応" })])

    expect(expiredViewedSpeech(pinnedAt(1), grown, "newest")).toBe(LATEST_VIEWED_SPEECH)
  })

  it("過去のやり取りの行を留めていても、いちばん新しいやり取りに1件届けば最新へ戻る", () => {
    const grown = turnSpeeches([...records, speechRecord({ text: "2件目" })])

    expect(expiredViewedSpeech(pinnedAt(0), grown, "newest")).toBe(LATEST_VIEWED_SPEECH)
  })

  it("新しいやり取りが始まって番号が替わると最新へ戻る", () => {
    const next = turnSpeeches([...records, requestRecord({ text: "次の依頼", turnId: 2 })])

    expect(expiredViewedSpeech(pinnedAt(0), next, "newest")).toBe(LATEST_VIEWED_SPEECH)
  })

  it("見ているやり取りが替わると最新へ戻る", () => {
    expect(expiredViewedSpeech(pinnedAt(0), turns, 0)).toBe(LATEST_VIEWED_SPEECH)
  })
})
