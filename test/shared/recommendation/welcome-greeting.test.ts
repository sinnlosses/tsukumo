import { describe, expect, it } from "vitest"

import {
  isWelcomeGreetingLine,
  NO_WELCOME_HEAD,
  type WelcomeGreeting,
  welcomeGreetingLine,
} from "../../../src/shared/recommendation/welcome-greeting.ts"

const GREETING = {
  withCard: "架空の挨拶、{札} からどう？",
  withoutCard: "架空の挨拶だけ",
  expression: "curious",
} as const satisfies WelcomeGreeting

describe("isWelcomeGreetingLine", () => {
  it("welcomeGreetingLine が組んだ文は、札ありも札なしも組める文とみなす", () => {
    expect(
      isWelcomeGreetingLine(GREETING, welcomeGreetingLine(GREETING, { kind: "card", name: "T-1" })),
    ).toBe(true)
    expect(isWelcomeGreetingLine(GREETING, welcomeGreetingLine(GREETING, NO_WELCOME_HEAD))).toBe(
      true,
    )
  })

  it.each([
    ["札の名前が空の文", "架空の挨拶、 からどう？"],
    ["差し込み口の前が違う文", "別の挨拶、T-1 からどう？"],
    ["差し込み口の後ろが違う文", "架空の挨拶、T-1 からどう"],
    ["どちらでもない文", "架空の別の文"],
  ])("%sは組めない", (_, text) => {
    expect(isWelcomeGreetingLine(GREETING, { text, expression: "curious" })).toBe(false)
  })

  it("表情が挨拶のものと違えば、文が合っていても組めない", () => {
    expect(isWelcomeGreetingLine(GREETING, { text: "架空の挨拶だけ", expression: "sad" })).toBe(
      false,
    )
  })
})
