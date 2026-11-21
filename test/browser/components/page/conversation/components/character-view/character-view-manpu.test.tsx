import { act, cleanup } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  NO_SPEECH_ARRIVAL,
  type SpeechManpu,
} from "../../../../../../../src/browser/components/page/conversation/domain/speech-arrival.ts"
import { useSpeechArrival } from "../../../../../../../src/browser/components/page/conversation/stores/speech-arrival.ts"
import { nowEpochMilliseconds } from "../../../../../../../src/browser/utils/clock.ts"
import type { Expression } from "../../../../../../../src/shared/character-pack/expression.ts"
import type { SessionState } from "../../../../../../../src/shared/session/session-state.ts"
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

describe("CharacterView（セリフが届いた瞬間のエフェクト）", () => {
  const cases: readonly (readonly [Expression, SpeechManpu])[] = [
    ["thinking", "ring"],
    ["proud", "sparkle"],
    ["flustered", "sweat"],
    ["serious", "flash"],
    ["curious", "ripple"],
    ["sad", "rain"],
    ["excited", "petals"],
    ["bored", "bubbles"],
  ]

  for (const [expression, manpu] of cases) {
    it(`${expression} が届くと、${manpu} のエフェクトが舞台に1つ、控えめの印つきで出る（立ち絵の動きが still でも）`, () => {
      renderCharacterView({ character: FIXTURE_CHARACTER })
      arriveWith(expression)

      expect(document.querySelectorAll("[data-manpu]")).toHaveLength(1)
      expect(shownManpu()).toBe(manpu)
      expect(document.querySelector("[data-manpu]")?.getAttribute("data-calm")).toBe("true")
      expect(document.querySelector("[data-manpu]")?.getAttribute("aria-hidden")).toBe("true")
    })
  }

  it("default が届いても出ない", () => {
    renderCharacterView({ character: FIXTURE_CHARACTER })
    arriveWith("default")

    expect(document.querySelector("[data-manpu]")).toBeNull()
  })

  it("動きを減らす設定では出ない", () => {
    stubPhoneWidth(true)
    renderCharacterView({ character: FIXTURE_CHARACTER })
    arriveWith("excited")

    expect(document.querySelector("[data-manpu]")).toBeNull()
  })

  it("届いてから窓を過ぎた古い届き（画面を開き直した場合）では出ない", () => {
    renderCharacterView({ character: FIXTURE_CHARACTER })
    arriveWith("excited", 60_000)

    expect(document.querySelector("[data-manpu]")).toBeNull()
  })

  it("立ち絵の素材が無ければ出ない", () => {
    renderCharacterView({ character: undefined })
    arriveWith("excited")

    expect(document.querySelector("[data-manpu]")).toBeNull()
  })
})

/** 失敗で閉じた姿。`closedAgoMs` は閉じてからの経過。 */
function failedTurn(closedAgoMs = 0): Partial<SessionState> {
  const finishedAt = nowEpochMilliseconds() - closedAgoMs
  return {
    turn: {
      kind: "finished",
      startedAt: finishedAt - 100,
      finishedAt,
      ending: { kind: "failed", failure: { kind: "execution-error" } },
    },
    character: FIXTURE_CHARACTER,
  }
}

const STAGE_PORTRAIT = "[data-character-stage] .character-layout [data-expression]"
const failShade = (): NodeListOf<Element> =>
  document.querySelectorAll('[class*="manpu-fail-shade"]')

describe("CharacterView（失敗の翳り）", () => {
  it("失敗で閉じた直後は、欠片4つの翳りが出て、ϟ の文字は出ない", () => {
    renderCharacterView(failedTurn())

    const manpu = document.querySelectorAll('[data-manpu="shock"]')
    expect(manpu).toHaveLength(1)
    expect(manpu[0]?.getAttribute("data-calm")).toBe("false")
    expect(manpu[0]?.querySelectorAll('[class*="manpu-shard"]')).toHaveLength(4)
    expect(manpu[0]?.textContent).not.toContain("ϟ")
  })

  it("暗くする重ねは舞台の立ち絵の中に1つだけあり、立ち絵の画の URL を持つ。セリフのログの床の立ち絵には無い", () => {
    renderCharacterView(failedTurn())

    expect(failShade()).toHaveLength(1)
    const shade = document.querySelector(`${STAGE_PORTRAIT} [class*="manpu-fail-shade"]`)
    expect(shade?.getAttribute("style")).toContain("/character/default.png")
  })

  it("動きを減らす設定・窓より前に閉じた記録・立ち絵の素材が無いときは出ない", () => {
    stubPhoneWidth(true)
    renderCharacterView(failedTurn())
    expect(document.querySelector('[data-manpu="shock"]')).toBeNull()
    expect(failShade()).toHaveLength(0)
    cleanup()
    vi.unstubAllGlobals()

    renderCharacterView(failedTurn(60_000))
    expect(document.querySelector('[data-manpu="shock"]')).toBeNull()
    expect(failShade()).toHaveLength(0)
    cleanup()

    renderCharacterView({ ...failedTurn(), character: undefined })
    expect(document.querySelector('[data-manpu="shock"]')).toBeNull()
    expect(failShade()).toHaveLength(0)
  })
})
