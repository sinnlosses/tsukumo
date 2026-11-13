import { cleanup, fireEvent, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { AizuchiPair } from "../../../../../../../src/shared/recommendation/aizuchi.ts"
import type { SessionEvent } from "../../../../../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../../../../../src/shared/session/session-fold.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../src/shared/session/session-state.ts"
import type { SentCommand } from "../../../../../../browser/session-store.ts"
import { renderCharacterView } from "../../../../../../fixture/character-view.tsx"
import { characterChangedEvent } from "../../../../../../fixture/character.ts"
import { requestEvent } from "../../../../../../fixture/session-event.ts"

// すべて手で書いた架空の札と返事。

afterEach(() => {
  cleanup()
  window.location.hash = ""
})

function pairs(moment: string): readonly AizuchiPair[] {
  return [0, 1, 2].map((index) => ({
    chip: `${moment}の札${String(index)}`,
    reply: `${moment}の返事${String(index)}`,
    expression: "default",
  }))
}

const WRITTEN = {
  kind: "aizuchi-written",
  pairs: { deliver: pairs("渡す"), stumble: pairs("つまずく"), work: pairs("働く") },
} as const satisfies SessionEvent

const COMPLETED = {
  kind: "turn-finished",
  outcome: { kind: "completed" },
} as const satisfies SessionEvent
const API_FAILED = {
  kind: "turn-finished",
  outcome: { kind: "failed", cause: { kind: "api-error" } },
} as const satisfies SessionEvent

function stateAfter(events: readonly SessionEvent[]): SessionState {
  return events.reduce(
    (state, event, position) => applySessionEvent(state, event, position + 1),
    applySessionEvent(INITIAL_SESSION_STATE, characterChangedEvent(), 0),
  )
}

function shownChips(): readonly string[] {
  return [...document.querySelectorAll('[data-slot="aizuchi"] button')].map(
    (button) => button.textContent,
  )
}

const STAGE = { placement: "stage" } as const

describe("CharacterView（相づちの札）", () => {
  it.each([
    ["渡したあとは2枚", [WRITTEN, requestEvent(), COMPLETED], ["渡すの札0", "渡すの札1"]],
    ["失敗のあとは1枚", [WRITTEN, requestEvent(), API_FAILED], ["つまずくの札0"]],
    ["働いているあいだは1枚", [WRITTEN, requestEvent()], ["働くの札0"]],
    ["始め方の一覧（greet）には出さない", [WRITTEN], []],
    ["書けていない代には出さない", [requestEvent(), COMPLETED], []],
  ] as const)("%s", (_, events, expected) => {
    renderCharacterView(stateAfter(events), "newest", STAGE)

    expect(shownChips()).toEqual(expected)
  })

  it("答え待ち（ask）には出さない", () => {
    const asking = {
      kind: "pending-changed",
      pending: [{ kind: "permission", id: "架空の許可", toolName: "架空のツール", input: {} }],
    } as const satisfies SessionEvent

    renderCharacterView(stateAfter([WRITTEN, requestEvent(), asking]), "newest", STAGE)

    expect(shownChips()).toEqual([])
  })

  it("過去のやり取りを見ているあいだは出さない", () => {
    const state = stateAfter([WRITTEN, requestEvent(), COMPLETED, requestEvent(), COMPLETED])

    renderCharacterView(state, 0, STAGE)

    expect(shownChips()).toEqual([])
  })

  it("押すと、局面と番号で pressAizuchi を送る", () => {
    const sent: SentCommand[] = []
    renderCharacterView(stateAfter([WRITTEN, requestEvent(), COMPLETED]), "newest", {
      ...STAGE,
      spy: (command) => {
        sent.push(command)
      },
    })

    fireEvent.click(screen.getByRole("button", { name: "渡すの札1" }))

    expect(sent).toEqual([{ procedure: "session.pressAizuchi", moment: "deliver", index: 1 }])
  })

  it("押したあとは、返事を吹き出しに出して札を引っ込める", () => {
    const state = stateAfter([WRITTEN, requestEvent(), COMPLETED, press()])

    renderCharacterView(state, "newest", STAGE)

    expect(shownChips()).toEqual([])
    expect(document.querySelector("[data-reaction]")?.textContent).toContain("渡すの返事0")
    expect(
      [...document.querySelectorAll('[data-slot="thread"] [data-who="you"]')].map(
        (line) => line.textContent,
      ),
    ).toContainEqual(expect.stringContaining("渡すの札0"))
  })
})

function press(): SessionEvent {
  return { kind: "aizuchi-pressed", moment: "deliver", index: 0 }
}
