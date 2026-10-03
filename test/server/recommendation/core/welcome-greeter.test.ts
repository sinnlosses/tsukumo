import { describe, expect, it } from "vitest"

import {
  greetWelcome,
  type WelcomeGreeterPorts,
} from "../../../../src/server/recommendation/core/welcome-greeter.ts"
import {
  WELCOME_GREETING_RECENT_LIMIT,
  type WelcomeGreetingText,
} from "../../../../src/server/recommendation/core/welcome-greeting.ts"
import type { WelcomeGreeting } from "../../../../src/shared/recommendation/welcome-greeting.ts"

// すべて手で書いた架空の材料と出力。

const MATERIAL = {
  persona: "架空の人格",
  expressions: [{ name: "default", label: "架空のふつう" }],
  calendar: { month: 1, dayOfWeek: 1, hour: 12 },
} as const

const OUTPUT = {
  withCard: "架空の挨拶、{札} から",
  withoutCard: "架空の挨拶",
  expression: "default",
}

function harness(
  query: WelcomeGreeterPorts["query"],
  recent: readonly WelcomeGreetingText[] = [],
): {
  readonly ports: WelcomeGreeterPorts
  readonly written: (readonly WelcomeGreetingText[])[]
  readonly emitted: WelcomeGreeting[]
} {
  const written: (readonly WelcomeGreetingText[])[] = []
  const emitted: WelcomeGreeting[] = []
  return {
    ports: {
      readRecent: () => recent,
      writeRecent: (entries) => {
        written.push(entries)
      },
      query,
      emit: (greeting) => {
        emitted.push(greeting)
      },
    },
    written,
    emitted,
  }
}

describe("greetWelcome", () => {
  it("検査を通れば、直近の先頭へ書いてから配る", async () => {
    const old = Array.from({ length: WELCOME_GREETING_RECENT_LIMIT }, (_, index) => ({
      withCard: `架空の古い挨拶${String(index)} {札}`,
      withoutCard: `架空の古い挨拶${String(index)}`,
    }))
    const { ports, written, emitted } = harness(() => Promise.resolve(OUTPUT), old)

    await greetWelcome(ports, MATERIAL)

    expect(emitted).toEqual([OUTPUT])
    expect(written).toHaveLength(1)
    expect(written[0]?.[0]).toEqual({ withCard: OUTPUT.withCard, withoutCard: OUTPUT.withoutCard })
    expect(written[0]).toHaveLength(WELCOME_GREETING_RECENT_LIMIT)
  })

  it("直近の挨拶を問い合わせに渡す", async () => {
    const prompts: string[] = []
    const { ports } = harness(
      (request) => {
        prompts.push(request.prompt)
        return Promise.resolve(OUTPUT)
      },
      [{ withCard: "架空の前回 {札}", withoutCard: "架空の前回" }],
    )

    await greetWelcome(ports, MATERIAL)

    expect(prompts[0]).toContain("- 架空の前回 {札}")
  })

  it("問い合わせが失敗したら、書かず配らない", async () => {
    const { ports, written, emitted } = harness(() => Promise.reject(new Error("架空の失敗")))

    await greetWelcome(ports, MATERIAL)

    expect(written).toEqual([])
    expect(emitted).toEqual([])
  })

  it("検査に落ちたら、書かず配らない", async () => {
    const { ports, written, emitted } = harness(() =>
      Promise.resolve({ ...OUTPUT, withCard: "差し込み口なし" }),
    )

    await greetWelcome(ports, MATERIAL)

    expect(written).toEqual([])
    expect(emitted).toEqual([])
  })
})
