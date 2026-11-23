import { QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { CharacterView } from "../../../../../../../src/browser/components/page/conversation/components/character-view/character-view.tsx"
import {
  MainView,
  VoiceBand,
} from "../../../../../../../src/browser/components/page/conversation/components/main-view/main-view.tsx"
import { LATEST_VIEWED_SPEECH } from "../../../../../../../src/browser/components/page/conversation/domain/pinned-speech.ts"
import { useViewedSpeech } from "../../../../../../../src/browser/components/page/conversation/stores/viewed-speech.ts"
import { loadMarkdown } from "../../../../../../../src/browser/features/report/markdown.tsx"
import { writeHashRoute } from "../../../../../../../src/browser/stores/location-hash.ts"
import type { SessionRecord } from "../../../../../../../src/shared/session/session-record.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../src/shared/session/session-state.ts"
import { FIXTURE_CHARACTER } from "../../../../../../fixture/character-view.tsx"
import { shownPortraits } from "../../../../../../fixture/character.ts"
import {
  reactionRecord,
  requestRecord,
  speechRecord,
} from "../../../../../../fixture/session-record.ts"
import { createTestQueryClient } from "../../../../../query-client.tsx"
import { putSession } from "../../../../../session-store.ts"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
  window.location.hash = ""
})

const CHARACTER: NonNullable<SessionState["character"]> = {
  ...FIXTURE_CHARACTER,
  expressions: [
    { name: "default", role: "通常", label: "通常" },
    { name: "proud", role: "得意気", label: "得意げ" },
    { name: "sad", role: "悲しみ", label: "しょんぼり" },
  ],
  ...shownPortraits({
    default: "/character/default.png",
    proud: "/character/proud.png",
    sad: "/character/sad.png",
  }),
}

function renderBoth(records: readonly SessionRecord[], viewedTurn: "newest" | number = "newest") {
  localStorage.setItem("tsukumo-outline-panel:v1", JSON.stringify({ collapse: "collapsed" }))
  writeHashRoute({
    screen: "conversation",
    turn: viewedTurn,
    pack: { kind: "in-use" },
    achievementDate: { kind: "today" },
  })
  putSession({
    ...INITIAL_SESSION_STATE,
    records,
    character: CHARACTER,
    speechExpression: "proud",
  })
  act(() => {
    useViewedSpeech.setState({ viewed: LATEST_VIEWED_SPEECH })
  })
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MainView />
      <VoiceBand />
      <CharacterView />
    </QueryClientProvider>,
  )
}

const expression = (): string | null | undefined =>
  document
    .querySelector("[data-character-stage] [data-expression]")
    ?.getAttribute("data-expression")

const row = (text: string): HTMLElement =>
  screen.getByText(text, { selector: '[data-speaker="character"]' })

const TWO_SPEECHES = [
  requestRecord({ text: "架空の依頼", turnId: 0 }),
  speechRecord({ text: "1つ目のセリフ", expression: "default" }),
  reactionRecord({ text: "反応のセリフ", expression: "sad" }),
  speechRecord({ text: "最新のセリフ", expression: "proud" }),
]

describe("仕事の流れのセリフを押すと、立ち絵がその時の表情になる", () => {
  it("過去のセリフを押すとその表情になり、行は押された状態になる", () => {
    renderBoth(TWO_SPEECHES)
    expect(expression()).toBe("proud")

    fireEvent.click(row("1つ目のセリフ"))

    expect(expression()).toBe("default")
    expect(row("1つ目のセリフ").getAttribute("aria-pressed")).toBe("true")
    expect(row("最新のセリフ").getAttribute("aria-pressed")).toBe("false")
  })

  it("反応の行も押せる", () => {
    renderBoth(TWO_SPEECHES)

    fireEvent.click(row("反応のセリフ"))

    expect(expression()).toBe("sad")
    expect(row("反応のセリフ").getAttribute("aria-pressed")).toBe("true")
  })

  it("留めた行をもう一度押すと最新へ戻る", () => {
    renderBoth(TWO_SPEECHES)
    fireEvent.click(row("1つ目のセリフ"))
    fireEvent.click(row("1つ目のセリフ"))

    expect(expression()).toBe("proud")
    expect(row("1つ目のセリフ").getAttribute("aria-pressed")).toBe("false")
  })

  it("留めているあいだに尾の付いている行を押すと最新へ戻る", () => {
    renderBoth(TWO_SPEECHES)
    fireEvent.click(row("1つ目のセリフ"))
    fireEvent.click(row("最新のセリフ"))

    expect(expression()).toBe("proud")
  })

  it("留めた行にフォーカスして Esc で戻る。別の行にフォーカスがあるときは戻らない", () => {
    renderBoth(TWO_SPEECHES)
    fireEvent.click(row("1つ目のセリフ"))

    fireEvent.keyDown(row("最新のセリフ"), { key: "Escape" })
    expect(expression()).toBe("default")

    fireEvent.keyDown(row("1つ目のセリフ"), { key: "Escape" })
    expect(expression()).toBe("proud")
  })

  it("過去のやり取りの行も押せる", () => {
    renderBoth(
      [
        ...TWO_SPEECHES,
        requestRecord({ text: "次の依頼", turnId: 1 }),
        speechRecord({ text: "次のセリフ", expression: "proud" }),
      ],
      0,
    )

    fireEvent.click(row("1つ目のセリフ"))

    expect(row("1つ目のセリフ").getAttribute("aria-pressed")).toBe("true")
    expect(expression()).toBe("default")
  })
})
