import { describe, expect, it } from "vitest"

import {
  neighborTurnId,
  turnStepOf,
  type TurnStepKeyEvent,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/turn-step-key.ts"

function keyEvent(overrides: Partial<TurnStepKeyEvent>): TurnStepKeyEvent {
  return {
    key: "[",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    isComposing: false,
    target: null,
    ...overrides,
  }
}

describe("turnStepOf", () => {
  it("[ は older、] は newer、ほかのキーは読まない", () => {
    expect(turnStepOf(keyEvent({ key: "[" }))).toBe("older")
    expect(turnStepOf(keyEvent({ key: "]" }))).toBe("newer")
    expect(turnStepOf(keyEvent({ key: "a" }))).toBeUndefined()
  })

  it("修飾キー付き・変換中は読まない", () => {
    expect(turnStepOf(keyEvent({ metaKey: true }))).toBeUndefined()
    expect(turnStepOf(keyEvent({ ctrlKey: true }))).toBeUndefined()
    expect(turnStepOf(keyEvent({ altKey: true }))).toBeUndefined()
    expect(turnStepOf(keyEvent({ isComposing: true }))).toBeUndefined()
  })

  it("入力要素の中は読まない", () => {
    expect(turnStepOf(keyEvent({ target: document.createElement("textarea") }))).toBeUndefined()
    expect(turnStepOf(keyEvent({ target: document.createElement("button") }))).toBe("older")
  })
})

describe("neighborTurnId", () => {
  it("古い順の並びで前後を返し、端では undefined", () => {
    expect(neighborTurnId([4, 7, 9], 7, "older")).toBe(4)
    expect(neighborTurnId([4, 7, 9], 7, "newer")).toBe(9)
    expect(neighborTurnId([4, 7, 9], 4, "older")).toBeUndefined()
    expect(neighborTurnId([4, 7, 9], 9, "newer")).toBeUndefined()
    expect(neighborTurnId([4, 7, 9], 5, "newer")).toBeUndefined()
  })
})
