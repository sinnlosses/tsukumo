import { act, cleanup } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  NO_SPEECH_ARRIVAL,
  type SpeechManpu,
} from "../../../../../../../src/browser/components/page/conversation/domain/speech-arrival.ts"
import { useSpeechArrival } from "../../../../../../../src/browser/components/page/conversation/stores/speech-arrival.ts"
import { nowEpochMilliseconds } from "../../../../../../../src/browser/utils/clock.ts"
import type { Expression } from "../../../../../../../src/shared/character-pack/expression.ts"
import {
  FIXTURE_CHARACTER,
  renderCharacterView,
} from "../../../../../../fixture/character-view.tsx"
import { stubPhoneWidth } from "../../../../../phone-width.ts"

beforeEach(() => {
  useSpeechArrival.setState({ arrival: NO_SPEECH_ARRIVAL })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.location.hash = ""
})

// セッションを差し込むと届いた瞬間が空に戻るので、描いたあとに届かせる。
function arriveWith(expression: Expression, ageMs = 0): void {
  act(() => {
    useSpeechArrival.setState({
      arrival: {
        kind: "arrived",
        turnId: 0,
        index: 0,
        expression,
        at: nowEpochMilliseconds() - ageMs,
      },
    })
  })
}

const shownManpu = (): string | null | undefined =>
  document.querySelector("[data-manpu]")?.getAttribute("data-manpu")

describe("CharacterView（セリフが届いた瞬間の漫符）", () => {
  const cases: readonly (readonly [Expression, SpeechManpu])[] = [
    ["default", "note"],
    ["thinking", "think"],
    ["proud", "twinkle"],
    ["flustered", "sweat"],
    ["serious", "glint"],
  ]

  for (const [expression, manpu] of cases) {
    it(`${expression} が届くと、${manpu} の漫符が舞台に1つ出る（立ち絵の動きが still でも）`, () => {
      renderCharacterView({ character: FIXTURE_CHARACTER })
      arriveWith(expression)

      expect(document.querySelectorAll("[data-manpu]")).toHaveLength(1)
      expect(shownManpu()).toBe(manpu)
      expect(document.querySelector("[data-manpu]")?.getAttribute("aria-hidden")).toBe("true")
    })
  }

  it("漫符の無い表情（きょとん）が届いても出ない", () => {
    renderCharacterView({ character: FIXTURE_CHARACTER })
    arriveWith("curious")

    expect(document.querySelector("[data-manpu]")).toBeNull()
  })

  it("動きを減らす設定では出ない", () => {
    stubPhoneWidth(true)
    renderCharacterView({ character: FIXTURE_CHARACTER })
    arriveWith("default")

    expect(document.querySelector("[data-manpu]")).toBeNull()
  })

  it("届いてから窓を過ぎた古い届き（画面を開き直した場合）では出ない", () => {
    renderCharacterView({ character: FIXTURE_CHARACTER })
    arriveWith("default", 60_000)

    expect(document.querySelector("[data-manpu]")).toBeNull()
  })

  it("立ち絵の素材が無ければ出ない", () => {
    renderCharacterView({ character: undefined })
    arriveWith("default")

    expect(document.querySelector("[data-manpu]")).toBeNull()
  })
})
