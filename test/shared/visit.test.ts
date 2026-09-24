import { describe, expect, it } from "bun:test"

import { type VisitScript } from "../../src/shared/character-visit.ts"
import { type SessionEvent } from "../../src/shared/session-event.ts"
import { applySessionEvent, INITIAL_SESSION_STATE } from "../../src/shared/session-state.ts"
import { applyVisitEvent, INITIAL_VISIT_STATE, type VisitState } from "../../src/shared/visit.ts"

// 台本も帰りの一言も手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。
const SCRIPT: VisitScript = [
  { speaker: "guest", expression: "curious", text: "架空の客の一言目" },
  { speaker: "host", expression: "proud", text: "架空のあるじの返事" },
  { speaker: "guest", expression: "bored", text: "架空の客の二言目" },
]

const VISITING: VisitState = {
  kind: "visiting",
  guest: "fictional-guest",
  script: SCRIPT,
  line: 0,
  farewell: "架空の帰りの一言",
}

describe("applyVisitEvent", () => {
  it("visit-started で台本の1行目から訪問が始まる", () => {
    const visit = applyVisitEvent(
      INITIAL_VISIT_STATE,
      {
        kind: "visit-started",
        guest: "fictional-guest",
        script: SCRIPT,
        farewell: "架空の帰りの一言",
      },
      1_000,
    )

    expect(visit).toEqual(VISITING)
  })

  it("visit-line-advanced で行が進む（台本の外の番号は無視する）", () => {
    expect(applyVisitEvent(VISITING, { kind: "visit-line-advanced", line: 2 }, 3_000)).toEqual({
      ...VISITING,
      line: 2,
    })
    expect(applyVisitEvent(VISITING, { kind: "visit-line-advanced", line: 3 }, 3_000)).toBe(
      VISITING,
    )
    expect(applyVisitEvent(VISITING, { kind: "visit-line-advanced", line: -1 }, 3_000)).toBe(
      VISITING,
    )
  })

  it("visit-ended で客と帰りの一言と帰った時刻だけが残る", () => {
    expect(applyVisitEvent(VISITING, { kind: "visit-ended", reason: "speech" }, 5_000)).toEqual({
      kind: "left",
      guest: "fictional-guest",
      farewell: "架空の帰りの一言",
      leftAt: 5_000,
    })
  })

  it("訪問中でなければ、行の進みと帰る合図は何も変えない", () => {
    expect(
      applyVisitEvent(INITIAL_VISIT_STATE, { kind: "visit-line-advanced", line: 1 }, 1_000),
    ).toBe(INITIAL_VISIT_STATE)
    expect(
      applyVisitEvent(INITIAL_VISIT_STATE, { kind: "visit-ended", reason: "request" }, 1_000),
    ).toBe(INITIAL_VISIT_STATE)
  })
})

describe("applySessionEvent の訪問", () => {
  it("訪問のイベントは visit だけを動かし、表情と記録には書かない", () => {
    const before = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "speech", text: "架空のセリフ", expression: "proud" },
      500,
    )

    const visitEvents: readonly SessionEvent[] = [
      {
        kind: "visit-started",
        guest: "fictional-guest",
        script: SCRIPT,
        farewell: "架空の帰りの一言",
      },
      { kind: "visit-line-advanced", line: 1 },
    ]
    const during = visitEvents.reduce(
      (state, event) => applySessionEvent(state, event, 1_000),
      before,
    )
    const after = applySessionEvent(during, { kind: "visit-ended", reason: "wait-over" }, 2_000)

    expect(during.visit).toEqual({ ...VISITING, line: 1 })
    expect(after.visit.kind).toBe("left")
    expect({ ...after, visit: before.visit }).toEqual(before)
  })
})
