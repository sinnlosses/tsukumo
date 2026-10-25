import { cleanup, fireEvent, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { applyRestoredEvents } from "../../../../../../../src/shared/session/restored-event.ts"
import type { ReportWaitingLine } from "../../../../../../../src/shared/session/session-event-report.ts"
import type { SessionEvent } from "../../../../../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../../../../../src/shared/session/session-fold.ts"
import type { SessionRecord } from "../../../../../../../src/shared/session/session-record.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../src/shared/session/session-state.ts"
import {
  FIXTURE_CHARACTER,
  REACTIONS,
  renderCharacterView,
  speech,
  WRITTEN_REACTIONS,
} from "../../../../../../fixture/character-view.tsx"
import { characterInfo, shownPortraits } from "../../../../../../fixture/character.ts"
import { reportEvent } from "../../../../../../fixture/report-event.ts"
import { requestEvent } from "../../../../../../fixture/session-event.ts"
import {
  reactionRecord,
  requestRecord,
  speechRecord,
} from "../../../../../../fixture/session-record.ts"
import { typedElement } from "../../../../../../typed-element.ts"

const CHARACTER_WITH_THINKING: NonNullable<SessionState["character"]> = {
  ...FIXTURE_CHARACTER,
  ...shownPortraits({ default: "/character/default.png", thinking: "/character/thinking.png" }),
}

/** 迎えの挨拶が書けた姿。 */
const WRITTEN_GREETING: SessionState["welcomeGreeting"] = {
  kind: "written",
  greeting: {
    withCard: "架空の挨拶 {札}",
    withoutCard: "架空の挨拶",
    expression: "default",
  },
}

afterEach(() => {
  cleanup()
  window.location.hash = ""
})

/** 通し番号 0 / 1 の2ターン分の記録（0 が過去、1 が今回）。 */
const TWO_TURN_RECORDS: readonly SessionRecord[] = [
  requestRecord({ text: "1つ目の依頼" }),
  speechRecord({ text: "1つ目のセリフA", expression: "proud" }),
  speechRecord({ text: "1つ目のセリフB", expression: "flustered" }),
  requestRecord({ turnId: 1, text: "2つ目の依頼" }),
  speechRecord({ text: "2つ目のセリフ", expression: "default" }),
]

describe("CharacterView", () => {
  it("(3) 立ち絵の URL が無い（character が undefined）ときは、吹き出しだけが出て落ちない", () => {
    expect(() =>
      renderCharacterView({ character: undefined, speeches: [speech("やあ、調子はどう？")] }),
    ).not.toThrow()

    expect(document.querySelector(".portrait")).toBeNull()
    expect(document.querySelector(".balloon-track")).not.toBeNull()
    expect(document.querySelector(".balloon-text")?.textContent).toBe("やあ、調子はどう？")
  })

  it("(1) 過去のターンを選ぶと、そのターンのセリフだけが吹き出しに出る", () => {
    renderCharacterView(
      {
        records: TWO_TURN_RECORDS,
        speeches: [speech("2つ目のセリフ")],
        character: FIXTURE_CHARACTER,
      },
      0,
    )

    expect(
      [...document.querySelectorAll(".balloon-text")].map((balloon) => balloon.textContent),
    ).toEqual(["1つ目のセリフB", "1つ目のセリフA"])
    // 最新（そのターンの最後）の1件だけが濃い（吹き出しの規則は変えない）。
    expect(document.querySelector(".balloon")?.getAttribute("data-latest")).toBe("true")
  })

  it("(2) 今回のターンを選ぶと、従来どおり今のセリフが出る", () => {
    renderCharacterView(
      {
        records: TWO_TURN_RECORDS,
        speeches: [speech("2つ目のセリフ")],
        character: FIXTURE_CHARACTER,
      },
      1,
    )

    expect(
      [...document.querySelectorAll(".balloon-text")].map((balloon) => balloon.textContent),
    ).toEqual(["2つ目のセリフ"])
  })

  it("(3) セリフが1件も無い過去のターンでも壊れず、吹き出しも反応も出さない", () => {
    const records: readonly SessionRecord[] = [
      requestRecord({ text: "1つ目の依頼" }),
      requestRecord({ turnId: 1, text: "2つ目の依頼" }),
      speechRecord({ text: "2つ目のセリフ" }),
    ]

    expect(() =>
      renderCharacterView(
        {
          records,
          speeches: [],
          turn: { kind: "running", startedAt: 0 },
          character: CHARACTER_WITH_THINKING,
          welcomeGreeting: WRITTEN_GREETING,
        },
        0,
      ),
    ).not.toThrow()

    expect(document.querySelectorAll(".balloon")).toHaveLength(0)
    expect(document.querySelector(".portrait")?.getAttribute("data-expression")).toBe("default")
  })

  it("今のターンで反応を出しているあいだは、反応の行の表情になる", () => {
    renderCharacterView({
      records: [requestRecord({ text: "架空の依頼" })],
      speeches: [],
      turn: { kind: "running", startedAt: 0 },
      apiTrouble: {
        kind: "retrying",
        at: 0,
        attempt: 1,
        maxRetries: 3,
        retryDelayMs: 1000,
        errorStatus: undefined,
        error: "unknown",
      },
      nextTurnId: 1,
      character: CHARACTER_WITH_THINKING,
      writtenReactions: WRITTEN_REACTIONS,
    })

    const balloon = document.querySelector(".balloon")
    expect(balloon?.getAttribute("data-reaction")).toBe("retrying")
    expect(balloon?.textContent).toContain("架空の再試行反応")
    expect(document.querySelector(".portrait")?.getAttribute("data-expression")).toBe("thinking")
  })

  it("過去のターンでは、そのターンの最後のセリフの表情になる", () => {
    renderCharacterView(
      {
        records: TWO_TURN_RECORDS,
        speeches: [speech("2つ目のセリフ")],
        speechExpression: "default",
        character: {
          ...FIXTURE_CHARACTER,
          expressions: [
            { name: "default", label: "通常" },
            { name: "flustered", label: "あわてた" },
          ],
          ...shownPortraits({
            default: "/character/default.png",
            flustered: "/character/flustered.png",
          }),
        },
      },
      0,
    )

    expect(document.querySelector(".portrait")?.getAttribute("data-expression")).toBe("flustered")
    expect(document.querySelector(".portrait-image")?.getAttribute("src")).toBe(
      "/character/flustered.png",
    )
  })
})

describe("CharacterView（反応の吹き出し）", () => {
  const REQUEST = requestEvent()
  const SPEECH = {
    kind: "speech",
    text: "架空のセリフ",
    expression: "default",
  } as const satisfies SessionEvent
  const COMPLETED = {
    kind: "turn-finished",
    outcome: { kind: "completed" },
  } as const satisfies SessionEvent
  const GREETED = {
    kind: "welcome-greeting-changed",
    state: WRITTEN_GREETING,
  } as const satisfies SessionEvent
  const REACTED = {
    kind: "reactions-written",
    reactions: REACTIONS,
  } as const satisfies SessionEvent

  function report(waitingLine: ReportWaitingLine): SessionEvent {
    return reportEvent({ waitingLine })
  }

  const WAITING_LINE = report({ kind: "speech", text: "架空の待ちの一言", expression: "default" })

  /** 並びの中の、ここまでが前のセッションを組み直した（時刻の分からない）出来事という印。 */
  const RESTORED = "restored" as const

  /** 時刻 0 から1つずつ畳んだ姿。待ちの一言の出る時刻はとうに過ぎている。 */
  function stateAfter(events: readonly (SessionEvent | typeof RESTORED)[]): SessionState {
    const marker = events.indexOf(RESTORED)
    const restored = marker === -1 ? [] : events.slice(0, marker)
    const live = marker === -1 ? events : events.slice(marker + 1)
    const afterRestored = applyRestoredEvents(
      INITIAL_SESSION_STATE,
      restored.flatMap((event) =>
        event === RESTORED ? [] : [{ event, time: { kind: "unknown" } as const }],
      ),
      0,
    )
    return live.reduce(
      (state, event, index) =>
        event === RESTORED ? state : applySessionEvent(state, event, restored.length + index),
      afterRestored,
    )
  }

  it.each<[string, readonly (SessionEvent | typeof RESTORED)[], string, string]>([
    [
      "利用上限で閉じると、前のセリフの下に利用上限の反応が最新として出る",
      [
        GREETED,
        REACTED,
        REQUEST,
        SPEECH,
        {
          kind: "rate-limit-changed",
          rateLimit: { kind: "rejected", bucket: "five-hour", resetsAt: undefined },
        },
        { kind: "turn-finished", outcome: { kind: "failed", cause: { kind: "api-error" } } },
      ],
      "limited",
      "架空の上限の反応",
    ],
    [
      "依頼を待つ間が続くと、Claude Code が report に書いた待ちの一言が最新として出る",
      [GREETED, REQUEST, SPEECH, WAITING_LINE, COMPLETED],
      "idle",
      "架空の待ちの一言",
    ],
    [
      "続きから開くと、前回の最後のターンの待ちの一言がおかえりとして最新に出る",
      [REQUEST, SPEECH, WAITING_LINE, COMPLETED, RESTORED, GREETED],
      "welcome",
      "架空の待ちの一言",
    ],
    [
      "続きから開いて待ちの一言が無ければ、迎えの挨拶の札なしの文がおかえりとして出る",
      [REQUEST, SPEECH, report({ kind: "none" }), COMPLETED, RESTORED, GREETED],
      "welcome",
      "架空の挨拶",
    ],
  ])("%s", (_, events, reaction, text) => {
    renderCharacterView({ ...stateAfter(events), character: FIXTURE_CHARACTER })

    const latest = document.querySelector(".balloon[data-latest='true']")
    expect(latest?.getAttribute("data-reaction")).toBe(reaction)
    expect(latest?.textContent).toContain(text)
  })
})

describe("CharacterView（記録に積んだ反応と時刻）", () => {
  const CHARACTER_WITH_SAD: NonNullable<SessionState["character"]> = {
    ...FIXTURE_CHARACTER,
    expressions: [
      { name: "default", label: "通常" },
      { name: "sad", label: "しょんぼり" },
    ],
    ...shownPortraits({ default: "/character/default.png", sad: "/character/sad.png" }),
  }

  it("過去のターンでは、積んだ反応も吹き出しに並び、反応で終わったターンはその表情になる", () => {
    renderCharacterView(
      {
        records: [
          requestRecord({ text: "1つ目の依頼" }),
          speechRecord({ text: "1つ目のセリフ", expression: "default" }),
          reactionRecord({ reaction: "failed", text: "架空の失敗の反応", expression: "sad" }),
          requestRecord({ turnId: 1, text: "2つ目の依頼" }),
          speechRecord({ text: "2つ目のセリフ" }),
        ],
        speeches: [speech("2つ目のセリフ")],
        character: CHARACTER_WITH_SAD,
      },
      0,
    )

    expect(
      [...document.querySelectorAll(".balloon-track .balloon-text")].map(
        (balloon) => balloon.textContent,
      ),
    ).toEqual(["架空の失敗の反応", "1つ目のセリフ"])
    expect(document.querySelector(".portrait")?.getAttribute("data-expression")).toBe("sad")
  })

  it("狭い画面の吹き出しの脇に、最新の1件の時刻を出す（分からなければ出さない）", () => {
    renderCharacterView({
      speeches: [{ text: "架空のセリフ", expression: "default", time: { kind: "stamped", at: 0 } }],
      character: FIXTURE_CHARACTER,
    })
    expect(document.querySelector(".phone-balloon-time")).not.toBeNull()

    cleanup()
    renderCharacterView({
      speeches: [{ text: "架空のセリフ", expression: "default", time: { kind: "restored" } }],
      character: FIXTURE_CHARACTER,
    })
    expect(document.querySelector(".phone-balloon-time")).toBeNull()
  })
})

// 狭い画面の顔と吹き出し（広い画面では CSS が消す。ここでは DOM の出し分けだけを見る）。
describe("CharacterView（狭い画面の顔と最新の1件）", () => {
  function phoneText(): string | null | undefined {
    return document.querySelector(".phone-balloon-text")?.textContent
  }

  it("吹き出しには最新のセリフ1件だけが出る", () => {
    renderCharacterView({
      speeches: [speech("架空の古いセリフ"), speech("架空の新しいセリフ")],
      character: characterInfo({ face: "/character/face.png" }),
    })

    expect(document.querySelectorAll(".phone-balloon-bubble")).toHaveLength(1)
    expect(phoneText()).toBe("架空の新しいセリフ")
    expect(document.querySelector(".phone-balloon-face")?.getAttribute("src")).toBe(
      "/character/face.png",
    )
  })

  it("反応を出しているあいだは、反応の字が出る", () => {
    renderCharacterView({
      records: [
        requestRecord({ text: "架空の依頼", turnId: 0 }),
        speechRecord({ text: "架空のセリフ" }),
      ],
      speeches: [speech("架空のセリフ")],
      speechCalledInTurn: true,
      turn: {
        kind: "finished",
        startedAt: 0,
        finishedAt: 1,
        ending: { kind: "failed", failure: { kind: "execution-error" } },
      },
      character: FIXTURE_CHARACTER,
      writtenReactions: WRITTEN_REACTIONS,
    })

    expect(phoneText()).toBe("架空の失敗の反応")
  })

  it("セリフも反応も無ければ顔だけで、吹き出しを出さない", () => {
    renderCharacterView({
      speeches: [],
      character: characterInfo({ face: "/character/face.png" }),
    })

    expect(document.querySelector(".phone-balloon-face")).not.toBeNull()
    expect(document.querySelector(".phone-balloon-bubble")).toBeNull()
  })

  it("吹き出しを押すとセリフのログが開く", () => {
    renderCharacterView({ speeches: [speech("架空のセリフ")], character: FIXTURE_CHARACTER })

    fireEvent.click(
      typedElement(
        document.querySelector(".phone-balloon-bubble"),
        HTMLButtonElement,
        "狭い画面の吹き出し",
      ),
    )

    expect(document.querySelector("dialog")?.hasAttribute("open")).toBe(true)
    expect(screen.getByRole("button", { name: "ログ" }).getAttribute("aria-expanded")).toBe("true")
  })
})
