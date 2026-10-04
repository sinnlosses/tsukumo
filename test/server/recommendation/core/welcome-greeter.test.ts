import { describe, expect, it } from "vitest"

import {
  greetWelcome,
  type WelcomeGreeterPorts,
} from "../../../../src/server/recommendation/core/welcome-greeter.ts"
import {
  WELCOME_GREETING_RECENT_LIMIT,
  type WelcomeGreetingText,
} from "../../../../src/server/recommendation/core/welcome-greeting.ts"
import type { WelcomeGreetingState } from "../../../../src/shared/recommendation/welcome-greeting.ts"

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

const NO_TIMEOUT = 60_000

/** 問い合わせの1件。結果は外から解く（`signal` が中断すれば自分で reject する。実物の `query()` と同じ契約）。 */
function harness(recent: readonly WelcomeGreetingText[] = []): {
  readonly ports: WelcomeGreeterPorts
  readonly written: (readonly WelcomeGreetingText[])[]
  readonly emitted: WelcomeGreetingState[]
  readonly queries: {
    readonly prompt: string
    readonly settle: (value: unknown) => void
    readonly fail: () => void
  }[]
} {
  const written: (readonly WelcomeGreetingText[])[] = []
  const emitted: WelcomeGreetingState[] = []
  const queries: {
    readonly prompt: string
    readonly settle: (value: unknown) => void
    readonly fail: () => void
  }[] = []
  const ports: WelcomeGreeterPorts = {
    readRecent: () => recent,
    writeRecent: (entries) => {
      written.push(entries)
    },
    query: (request, signal) =>
      new Promise((resolve, reject) => {
        queries.push({
          prompt: request.prompt,
          settle: resolve,
          fail: () => reject(new Error("架空")),
        })
        signal.addEventListener("abort", () => {
          reject(new Error("架空の中断"))
        })
      }),
    emit: (state) => {
      emitted.push(state)
    },
  }
  return { ports, written, emitted, queries }
}

/** 解いた問い合わせの続きが走り終わるのを待つ。 */
function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe("greetWelcome", () => {
  it("書き始めに writing を配る", async () => {
    const { ports, emitted, queries } = harness()

    const promise = greetWelcome(ports, MATERIAL, new AbortController().signal, NO_TIMEOUT)
    queries[0]?.settle(OUTPUT)
    await promise

    expect(emitted[0]).toEqual({ kind: "writing" })
  })

  it("検査を通れば、直近の先頭へ書いてから written を配る", async () => {
    const old = Array.from({ length: WELCOME_GREETING_RECENT_LIMIT }, (_, index) => ({
      withCard: `架空の古い挨拶${String(index)} {札}`,
      withoutCard: `架空の古い挨拶${String(index)}`,
    }))
    const { ports, written, emitted, queries } = harness(old)

    const promise = greetWelcome(ports, MATERIAL, new AbortController().signal, NO_TIMEOUT)
    queries[0]?.settle(OUTPUT)
    await promise

    expect(emitted).toEqual([{ kind: "writing" }, { kind: "written", greeting: OUTPUT }])
    expect(written).toHaveLength(1)
    expect(written[0]?.[0]).toEqual({ withCard: OUTPUT.withCard, withoutCard: OUTPUT.withoutCard })
    expect(written[0]).toHaveLength(WELCOME_GREETING_RECENT_LIMIT)
  })

  it("直近の挨拶を問い合わせに渡す", async () => {
    const { ports, queries } = harness([{ withCard: "架空の前回 {札}", withoutCard: "架空の前回" }])

    const promise = greetWelcome(ports, MATERIAL, new AbortController().signal, NO_TIMEOUT)
    queries[0]?.settle(OUTPUT)
    await promise

    expect(queries[0]?.prompt).toContain("- 架空の前回 {札}")
  })

  it("1回目が失敗したら1回だけ問い合わせ直し、通れば written を配る", async () => {
    const { ports, written, emitted, queries } = harness()

    const promise = greetWelcome(ports, MATERIAL, new AbortController().signal, NO_TIMEOUT)
    queries[0]?.fail()
    await flush()
    expect(queries).toHaveLength(2)
    queries[1]?.settle(OUTPUT)
    await promise

    expect(emitted).toEqual([{ kind: "writing" }, { kind: "written", greeting: OUTPUT }])
    expect(written).toHaveLength(1)
  })

  it("問い合わせ直しも失敗したら、fallback を配る", async () => {
    const { ports, written, emitted, queries } = harness()

    const promise = greetWelcome(ports, MATERIAL, new AbortController().signal, NO_TIMEOUT)
    queries[0]?.fail()
    await flush()
    expect(queries).toHaveLength(2)
    queries[1]?.fail()
    await promise

    expect(emitted).toEqual([{ kind: "writing" }, { kind: "fallback" }])
    expect(written).toEqual([])
  })

  it("検査に落ちたときも問い合わせ直し、2回とも落ちれば fallback を配る", async () => {
    const { ports, emitted, queries } = harness()

    const promise = greetWelcome(ports, MATERIAL, new AbortController().signal, NO_TIMEOUT)
    queries[0]?.settle({ ...OUTPUT, withCard: "差し込み口なし" })
    await flush()
    expect(queries).toHaveLength(2)
    queries[1]?.settle({ ...OUTPUT, withCard: "差し込み口なし" })
    await promise

    expect(emitted).toEqual([{ kind: "writing" }, { kind: "fallback" }])
  })

  it("締め切りを過ぎたら中断して fallback を配り、その後に届いた答えは配らない", async () => {
    const { ports, written, emitted, queries } = harness()

    await greetWelcome(ports, MATERIAL, new AbortController().signal, 10)

    expect(emitted).toEqual([{ kind: "writing" }, { kind: "fallback" }])
    expect(written).toEqual([])

    // 締め切りのあとに答えが来ても、呼び終わった greetWelcome はもう何も配らない。
    queries[0]?.settle(OUTPUT)
    await flush()
    expect(emitted).toEqual([{ kind: "writing" }, { kind: "fallback" }])
  })

  it("外から渡した signal を中断すると、結果に関わらず何も配らない（writing のあとに何も続かない）", async () => {
    const { ports, written, emitted, queries } = harness()
    const controller = new AbortController()

    const promise = greetWelcome(ports, MATERIAL, controller.signal, NO_TIMEOUT)
    controller.abort()
    await promise
    queries[0]?.settle(OUTPUT)
    await flush()

    expect(emitted).toEqual([{ kind: "writing" }])
    expect(written).toEqual([])
  })
})
