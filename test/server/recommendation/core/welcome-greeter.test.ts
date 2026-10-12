import { describe, expect, it } from "vitest"

import {
  createWelcomeGreeter,
  greetWelcome,
  type UnwrittenPlace,
  type WelcomeGreeterPorts,
} from "../../../../src/server/recommendation/core/welcome-greeter.ts"
import {
  WELCOME_GREETING_RECENT_LIMIT,
  type WelcomeGreetingText,
} from "../../../../src/server/recommendation/core/welcome-greeting.ts"
import type { WelcomeWritingFootprint } from "../../../../src/shared/diagnostic/welcome-writing.ts"
import type { WrittenReactions } from "../../../../src/shared/recommendation/reaction.ts"
import type { WelcomeGreetingState } from "../../../../src/shared/recommendation/welcome-greeting.ts"

// すべて手で書いた架空の材料と出力。

const MATERIAL = {
  persona: "架空の人格",
  expressions: [{ name: "default", label: "架空のふつう" }],
  calendar: { month: 1, dayOfWeek: 1, hour: 12 },
  visit: { kind: "start" },
} as const

const OUTPUT = {
  withCard: "架空の挨拶、{札} から",
  withoutCard: "架空の挨拶",
  expression: "default",
}

const REACTIONS = {
  retrying: { text: "架空の再試行", expression: "default" },
  failed: { text: "架空の失敗", expression: "default" },
  limited: { text: "架空の上限", expression: "default" },
  idle: { text: "架空の待ち", expression: "default" },
}

const NO_TIMEOUT = 60_000

/** 偽の時計の始まり（エポックミリ秒）。 */
const START_AT = 1_000_000

/**
 * 問い合わせの1件。結果は外から解く（`signal` が中断すれば自分で reject する。実物の `query()` と同じ契約）。
 * 時計は `advance` で進めるまで止まっている。
 */
function harness(recent: readonly WelcomeGreetingText[] = []): {
  readonly ports: WelcomeGreeterPorts
  readonly written: (readonly WelcomeGreetingText[])[]
  readonly emitted: WelcomeGreetingState[]
  readonly queries: {
    readonly prompt: string
    readonly settle: (value: unknown) => void
    readonly fail: () => void
  }[]
  readonly unwritten: { readonly place: UnwrittenPlace; readonly error: unknown }[]
  readonly reported: WelcomeWritingFootprint[]
  readonly reactions: WrittenReactions[]
  readonly advance: (ms: number) => void
} {
  const written: (readonly WelcomeGreetingText[])[] = []
  const emitted: WelcomeGreetingState[] = []
  const reactions: WrittenReactions[] = []
  const unwritten: { place: UnwrittenPlace; error: unknown }[] = []
  const reported: WelcomeWritingFootprint[] = []
  const queries: {
    readonly prompt: string
    readonly settle: (value: unknown) => void
    readonly fail: () => void
  }[] = []
  let clock = START_AT
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
    now: () => clock,
    emit: (state) => {
      emitted.push(state)
    },
    emitReactions: (entry) => {
      reactions.push(entry)
    },
    onUnwritten: (place, error) => {
      unwritten.push({ place, error })
    },
    report: (footprint) => {
      reported.push(footprint)
    },
  }
  const advance = (ms: number): void => {
    clock += ms
  }
  return { ports, written, emitted, queries, unwritten, reported, reactions, advance }
}

/** 挨拶の問い合わせか（反応の行の問い合わせは材料の節を持たない）。 */
function isGreetingQuery(query: { readonly prompt: string }): boolean {
  return query.prompt.startsWith("## 材料")
}

/** 解いた問い合わせの続きが走り終わるのを待つ。 */
function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe("greetWelcome", () => {
  it("検査を通れば、直近の先頭へ挨拶の2文だけを書いてから written を配る", async () => {
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

  it("問い合わせ直しも失敗したら、unwritten を配る", async () => {
    const { ports, written, emitted, queries, unwritten } = harness()

    const promise = greetWelcome(ports, MATERIAL, new AbortController().signal, NO_TIMEOUT)
    queries[0]?.fail()
    await flush()
    expect(queries).toHaveLength(2)
    queries[1]?.fail()
    await promise

    expect(emitted).toEqual([{ kind: "writing" }, { kind: "unwritten" }])
    expect(written).toEqual([])
    expect(unwritten.map((entry) => entry.place)).toEqual(["welcome-greeting-failed"])
    expect(unwritten[0]?.error).toBeInstanceOf(Error)
  })

  it("検査に落ちたときも問い合わせ直し、2回とも落ちれば unwritten を配る", async () => {
    const { ports, emitted, queries, unwritten } = harness()

    const promise = greetWelcome(ports, MATERIAL, new AbortController().signal, NO_TIMEOUT)
    queries[0]?.settle({ ...OUTPUT, withCard: "差し込み口なし" })
    await flush()
    expect(queries).toHaveLength(2)
    queries[1]?.settle({ ...OUTPUT, withCard: "差し込み口なし" })
    await promise

    expect(emitted).toEqual([{ kind: "writing" }, { kind: "unwritten" }])
    expect(unwritten.map((entry) => entry.place)).toEqual(["welcome-greeting-rejected"])
  })

  it("締め切りを過ぎたら中断して unwritten を配り、その後に届いた答えは配らない", async () => {
    const { ports, written, emitted, queries, unwritten } = harness()

    await greetWelcome(ports, MATERIAL, new AbortController().signal, 10)

    expect(emitted).toEqual([{ kind: "writing" }, { kind: "unwritten" }])
    expect(written).toEqual([])
    expect(unwritten.map((entry) => entry.place)).toEqual(["welcome-greeting-timed-out"])

    // 締め切りのあとに答えが来ても、呼び終わった greetWelcome はもう何も配らない。
    queries[0]?.settle(OUTPUT)
    await flush()
    expect(emitted).toEqual([{ kind: "writing" }, { kind: "unwritten" }])
  })

  it("外から渡した signal を中断すると、結果に関わらず何も配らない（writing のあとに何も続かない）", async () => {
    const { ports, written, emitted, queries, unwritten } = harness()
    const controller = new AbortController()

    const promise = greetWelcome(ports, MATERIAL, controller.signal, NO_TIMEOUT)
    controller.abort()
    await promise
    queries[0]?.settle(OUTPUT)
    await flush()

    expect(emitted).toEqual([{ kind: "writing" }])
    expect(written).toEqual([])
    expect(unwritten).toEqual([])
  })
})

describe("greetWelcome の足跡", () => {
  it("1回で書けたら、全体と1回目の所要を written で1回知らせる", async () => {
    const { ports, queries, reported, advance } = harness()

    const promise = greetWelcome(ports, MATERIAL, new AbortController().signal, NO_TIMEOUT)
    advance(8900)
    queries[0]?.settle(OUTPUT)
    await promise

    expect(reported).toEqual([
      {
        flow: "welcome-writing",
        at: START_AT + 8900,
        target: "greeting",
        outcome: "written",
        durationMs: 8900,
        attempts: [{ result: "written", ms: 8900 }],
      },
    ])
  })

  it("1回目が検査に落ちて2回目で書けたら、落ちた理由と各回の所要を知らせる", async () => {
    const { ports, queries, reported, advance } = harness()

    const promise = greetWelcome(ports, MATERIAL, new AbortController().signal, NO_TIMEOUT)
    advance(6000)
    queries[0]?.settle({ ...OUTPUT, withCard: "差し込み口なし" })
    await flush()
    advance(3000)
    queries[1]?.settle(OUTPUT)
    await promise

    expect(reported).toEqual([
      expect.objectContaining({
        outcome: "written",
        durationMs: 9000,
        attempts: [
          { result: "rejected", reason: "mark-count", ms: 6000 },
          { result: "written", ms: 3000 },
        ],
      }),
    ])
  })

  it("2回とも問い合わせが失敗したら failed で知らせる", async () => {
    const { ports, queries, reported } = harness()

    const promise = greetWelcome(ports, MATERIAL, new AbortController().signal, NO_TIMEOUT)
    queries[0]?.fail()
    await flush()
    queries[1]?.fail()
    await promise

    expect(reported.map((footprint) => footprint.outcome)).toEqual(["failed"])
    expect(reported[0]?.attempts.map((attempt) => attempt.result)).toEqual(["failed", "failed"])
  })

  it("締め切りで中断した問い合わせは timed-out で、問い合わせ直さない", async () => {
    const { ports, reported } = harness()

    await greetWelcome(ports, MATERIAL, new AbortController().signal, 10)

    expect(reported.map((footprint) => footprint.outcome)).toEqual(["timed-out"])
    expect(reported[0]?.attempts.map((attempt) => attempt.result)).toEqual(["timed-out"])
  })

  it("外から渡した signal で中断したら知らせない", async () => {
    const { ports, reported } = harness()
    const controller = new AbortController()

    const promise = greetWelcome(ports, MATERIAL, controller.signal, NO_TIMEOUT)
    controller.abort()
    await promise

    expect(reported).toEqual([])
  })
})

describe("createWelcomeGreeter", () => {
  it("start は挨拶の答えを待たずに、反応の行の問い合わせも同時に起こす", () => {
    const { ports, queries } = harness()

    createWelcomeGreeter(ports).start(MATERIAL)

    expect(queries.map(isGreetingQuery)).toEqual([true, false])
  })

  it("rewriteGreeting は挨拶だけを問い合わせ、反応の行の問い合わせを起こさない", () => {
    const { ports, queries } = harness()
    const greeter = createWelcomeGreeter(ports)

    greeter.start(MATERIAL)
    greeter.rewriteGreeting(MATERIAL)

    expect(queries.map(isGreetingQuery)).toEqual([true, false, true])
  })

  it("挨拶が書けなくても、反応の行が書ければ配る", async () => {
    const { ports, queries, emitted, reactions, reported } = harness()

    createWelcomeGreeter(ports).start(MATERIAL)
    queries[1]?.settle(REACTIONS)
    queries[0]?.fail()
    await flush()
    queries.filter(isGreetingQuery)[1]?.fail()
    await flush()

    expect(emitted).toEqual([{ kind: "writing" }, { kind: "unwritten" }])
    expect(reactions).toEqual([REACTIONS])
    expect(reported.map((footprint) => [footprint.target, footprint.outcome])).toEqual([
      ["reactions", "written"],
      ["greeting", "failed"],
    ])
  })

  it("反応の行が2回とも書けなければ配らず、反応の場所で知らせる", async () => {
    const { ports, queries, emitted, reactions, unwritten } = harness()

    createWelcomeGreeter(ports).start(MATERIAL)
    queries[0]?.settle(OUTPUT)
    queries[1]?.settle({ ...REACTIONS, idle: { text: "", expression: "default" } })
    await flush()
    queries.filter((query) => !isGreetingQuery(query))[1]?.settle({})
    await flush()

    expect(emitted).toEqual([{ kind: "writing" }, { kind: "written", greeting: OUTPUT }])
    expect(reactions).toEqual([])
    expect(unwritten.map((entry) => entry.place)).toEqual(["welcome-reactions-rejected"])
  })
})
