import { act, cleanup, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { loadMarkdown } from "../../../../../../../src/browser/features/report/markdown.tsx"
import { writeHashRoute } from "../../../../../../../src/browser/stores/location-hash.ts"
import type { SessionRecord } from "../../../../../../../src/shared/session/session-record.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../src/shared/session/session-state.ts"
import { FIXTURE_CHARACTER } from "../../../../../../fixture/character-view.tsx"
import { renderMainView } from "../../../../../../fixture/main-view.tsx"
import {
  reportRecord,
  requestRecord,
  speechRecord,
} from "../../../../../../fixture/session-record.ts"
import { advanceState, putState } from "../../../../../session-store.ts"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.location.hash = ""
})

const RUNNING = { kind: "running", startedAt: 0 } as const

function runningState(records: readonly SessionRecord[]): SessionState {
  return {
    ...INITIAL_SESSION_STATE,
    turn: RUNNING,
    sdkTurn: {
      kind: "open",
      bodies: { report: true, utterance: true },
      answeringAside: false,
      reportDrafting: { kind: "idle" },
    },
    records,
    character: FIXTURE_CHARACTER,
  }
}

const BEFORE = [
  requestRecord({ text: "架空の依頼", turnId: 0 }),
  speechRecord({ text: "前のセリフ" }),
]

function renderRunning(records: readonly SessionRecord[]): void {
  renderMainView(records, RUNNING)
  act(() => {
    putState(runningState(records))
  })
}

const arrivals = (): string[] =>
  [...document.querySelectorAll("[data-arrival]")].map(
    (el) => el.getAttribute("data-arrival") ?? "",
  )

const row = (text: string): HTMLElement =>
  screen.getByText(text, { selector: '[data-speaker="character"]' })

describe("セリフが届いた瞬間の吹き出しの出方", () => {
  it("最新のセリフの吹き出しだけに、表情の出方が付く", () => {
    renderRunning(BEFORE)
    act(() => {
      advanceState(
        runningState([...BEFORE, speechRecord({ text: "新しいセリフ", expression: "proud" })]),
      )
    })

    expect(row("新しいセリフ").getAttribute("data-arrival")).toBe("swell")
    expect(row("前のセリフ").hasAttribute("data-arrival")).toBe(false)
  })

  it("声のある姿を丸ごと入れて描いただけ（復元・開いた直後）では付かない", () => {
    renderRunning([...BEFORE, speechRecord({ text: "もう1つ", expression: "proud" })])

    expect(arrivals()).toEqual([])
  })

  it("届いた直後に過去のやり取りを選ぶと、過去の行には付かない", () => {
    const old = [
      requestRecord({ text: "古い依頼", turnId: 0 }),
      speechRecord({ text: "古いセリフ" }),
    ]
    const current = [...old, requestRecord({ text: "新しい依頼", turnId: 1 })]
    writeHashRoute({
      screen: "conversation",
      turn: 0,
      pack: { kind: "in-use" },
      achievementDate: { kind: "today" },
    })
    renderRunning(current)
    act(() => {
      advanceState(
        runningState([...current, speechRecord({ text: "新しいセリフ", expression: "proud" })]),
      )
    })

    expect(arrivals()).toEqual([])
  })

  it("最終レポートのあるやり取りで声が届いたあと経過の畳みを開いても、畳みの中の行には付かない", () => {
    const withReport = [
      requestRecord({ text: "架空の依頼", turnId: 0 }),
      speechRecord({ text: "畳みの中のセリフ" }),
      reportRecord("架空の結論"),
    ]
    renderRunning(withReport)
    act(() => {
      advanceState(
        runningState([...withReport, speechRecord({ text: "締めのセリフ", expression: "proud" })]),
      )
    })
    for (const details of document.querySelectorAll("details")) {
      details.open = true
    }

    for (const fold of document.querySelectorAll(".progress-fold")) {
      expect(fold.querySelector("[data-arrival]")).toBeNull()
    }
  })

  it("動きを減らす設定では、どこにも付かない", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }))
    renderRunning(BEFORE)
    act(() => {
      advanceState(
        runningState([...BEFORE, speechRecord({ text: "新しいセリフ", expression: "proud" })]),
      )
    })

    expect(arrivals()).toEqual([])
  })
})

describe("声の定位置の吹き出しの出方", () => {
  const greeting = {
    withCard: "架空の挨拶 {札}",
    withoutCard: "架空の挨拶",
    expression: "excited",
  } as const

  function renderWelcome(welcomeGreeting: SessionState["welcomeGreeting"]): void {
    renderMainView([])
    act(() => {
      putState({ ...INITIAL_SESSION_STATE, character: FIXTURE_CHARACTER, welcomeGreeting })
    })
  }

  const slotBubble = (): Element | null =>
    document.querySelector("[data-voice-slot] [data-speaker='character']")

  it("迎える場面で挨拶が書けると、挨拶の表情の出方が付く", () => {
    renderWelcome({ kind: "writing" })
    act(() => {
      advanceState({
        ...INITIAL_SESSION_STATE,
        character: FIXTURE_CHARACTER,
        welcomeGreeting: { kind: "written", greeting },
      })
    })

    expect(slotBubble()?.getAttribute("data-arrival")).toBe("swell")
  })

  it("定位置が声を出している姿を丸ごと入れて描いただけでは付かない", () => {
    renderWelcome({ kind: "written", greeting })

    expect(slotBubble()).not.toBeNull()
    expect(slotBubble()?.hasAttribute("data-arrival")).toBe(false)
  })
})
