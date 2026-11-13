import { describe, expect, it } from "vitest"

import {
  headingStepOf,
  neighborTurnId,
  readingKeyOf,
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
    target: undefined,
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

describe("headingStepOf", () => {
  it("{ は older、} は newer、[ ] やほかのキーは読まない", () => {
    expect(headingStepOf(keyEvent({ key: "{" }))).toBe("older")
    expect(headingStepOf(keyEvent({ key: "}" }))).toBe("newer")
    expect(headingStepOf(keyEvent({ key: "[" }))).toBeUndefined()
    expect(headingStepOf(keyEvent({ key: "a" }))).toBeUndefined()
    expect(turnStepOf(keyEvent({ key: "{" }))).toBeUndefined()
  })

  it("修飾キー付き・変換中は読まない", () => {
    expect(headingStepOf(keyEvent({ key: "{", metaKey: true }))).toBeUndefined()
    expect(headingStepOf(keyEvent({ key: "{", ctrlKey: true }))).toBeUndefined()
    expect(headingStepOf(keyEvent({ key: "{", altKey: true }))).toBeUndefined()
    expect(headingStepOf(keyEvent({ key: "}", isComposing: true }))).toBeUndefined()
  })

  it("入力要素の中は読まない", () => {
    const target = document.createElement("textarea")
    expect(headingStepOf(keyEvent({ key: "{", target }))).toBeUndefined()
    expect(headingStepOf(keyEvent({ key: "{", target: document.createElement("button") }))).toBe(
      "older",
    )
  })
})

describe("readingKeyOf", () => {
  it("d は読む深さ、o は畳み、ほかのキーは読まない", () => {
    expect(readingKeyOf(keyEvent({ key: "d" }))).toBe("depth")
    expect(readingKeyOf(keyEvent({ key: "o" }))).toBe("fold")
    expect(readingKeyOf(keyEvent({ key: "{" }))).toBe("none")
  })

  it("入力要素の中・修飾キー付きは読まない", () => {
    const target = document.createElement("textarea")
    expect(readingKeyOf(keyEvent({ key: "d", target }))).toBe("none")
    expect(readingKeyOf(keyEvent({ key: "d", metaKey: true }))).toBe("none")
  })

  it("? はキーの一覧。入力要素の中・変換中・修飾キー付きは読まない", () => {
    expect(readingKeyOf(keyEvent({ key: "?" }))).toBe("help")
    expect(readingKeyOf(keyEvent({ key: "?", target: document.createElement("textarea") }))).toBe(
      "none",
    )
    expect(readingKeyOf(keyEvent({ key: "?", isComposing: true }))).toBe("none")
    expect(readingKeyOf(keyEvent({ key: "?", metaKey: true }))).toBe("none")
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
