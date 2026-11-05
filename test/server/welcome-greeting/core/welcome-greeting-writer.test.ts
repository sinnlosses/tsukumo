import { describe, expect, it, vi } from "vitest"

import { greetWelcome } from "../../../../src/server/welcome-greeting/core/welcome-greeting-writer.ts"
import { WELCOME_GREETING_RECENT_LIMIT } from "../../../../src/server/welcome-greeting/core/welcome-greeting.ts"
import {
  flushWelcomeWriting as flush,
  welcomeGreeterHarness as harness,
  WELCOME_MATERIAL as MATERIAL,
  WELCOME_OUTPUT as OUTPUT,
  WELCOME_START_AT as START_AT,
} from "../../../fixture/welcome-greeter.ts"

const NO_TIMEOUT = 60_000

/** 起こされた順に `count` 回、1回ずつ失敗させる（前の回が落ちてから次の回が起きるのを待つ）。 */
async function failEach(queries: readonly { readonly fail: () => void }[], count: number) {
  for (let index = 0; index < count; index += 1) {
    expect(queries).toHaveLength(index + 1)
    queries[index]?.fail()
    await flush()
  }
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

  it("問い合わせ直しも4回とも失敗したら、unwritten を配る", async () => {
    const { ports, written, emitted, queries, unwritten } = harness()

    const promise = greetWelcome(ports, MATERIAL, new AbortController().signal, NO_TIMEOUT)
    await failEach(queries, 4)
    await promise

    expect(emitted).toEqual([{ kind: "writing" }, { kind: "unwritten" }])
    expect(written).toEqual([])
    expect(unwritten.map((entry) => entry.place)).toEqual(["welcome-greeting-failed"])
    expect(unwritten[0]?.error).toBeInstanceOf(Error)
  })

  it("検査に落ちたときも問い合わせ直し、4回とも落ちれば unwritten を配る", async () => {
    const { ports, emitted, queries, unwritten } = harness()

    const promise = greetWelcome(ports, MATERIAL, new AbortController().signal, NO_TIMEOUT)
    for (let index = 0; index < 4; index += 1) {
      expect(queries).toHaveLength(index + 1)
      queries[index]?.settle({ ...OUTPUT, withCard: "差し込み口なし" })
      await flush()
    }
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

  it("4回とも失敗し直近があれば、最も古い直近の挨拶を default の written で配り、書き戻さない", async () => {
    const recent = [
      { withCard: "架空の新しい挨拶 {札}", withoutCard: "架空の新しい挨拶" },
      { withCard: "架空の古い挨拶 {札}", withoutCard: "架空の古い挨拶" },
    ]
    const { ports, written, emitted, queries, unwritten } = harness(recent)

    const promise = greetWelcome(ports, MATERIAL, new AbortController().signal, NO_TIMEOUT)
    await failEach(queries, 4)
    await promise

    expect(emitted).toEqual([
      { kind: "writing" },
      { kind: "written", greeting: { ...recent[1], expression: "default" } },
    ])
    expect(written).toEqual([])
    expect(unwritten.map((entry) => entry.place)).toEqual(["welcome-greeting-failed"])
  })

  it("検査落ちでも直近があれば最も古い挨拶を配る", async () => {
    const recent = [
      { withCard: "架空の新しい挨拶 {札}", withoutCard: "架空の新しい挨拶" },
      { withCard: "架空の古い挨拶 {札}", withoutCard: "架空の古い挨拶" },
    ]
    const { ports, emitted, queries, unwritten } = harness(recent)

    const promise = greetWelcome(ports, MATERIAL, new AbortController().signal, NO_TIMEOUT)
    for (let index = 0; index < 4; index += 1) {
      queries[index]?.settle({ ...OUTPUT, withCard: "差し込み口なし" })
      await flush()
    }
    await promise

    expect(emitted).toEqual([
      { kind: "writing" },
      { kind: "written", greeting: { ...recent[1], expression: "default" } },
    ])
    expect(unwritten.map((entry) => entry.place)).toEqual(["welcome-greeting-rejected"])
  })

  it("締め切りを過ぎても直近があれば最も古い挨拶を配る", async () => {
    const recent = [{ withCard: "架空の挨拶 {札}", withoutCard: "架空の挨拶" }]
    const { ports, written, emitted, unwritten } = harness(recent)

    await greetWelcome(ports, MATERIAL, new AbortController().signal, 10)

    expect(emitted).toEqual([
      { kind: "writing" },
      { kind: "written", greeting: { ...recent[0], expression: "default" } },
    ])
    expect(written).toEqual([])
    expect(unwritten.map((entry) => entry.place)).toEqual(["welcome-greeting-timed-out"])
  })

  it("直近があっても、signal を中断したときは何も配らない", async () => {
    const { ports, emitted, queries } = harness([
      { withCard: "架空の挨拶 {札}", withoutCard: "架空の挨拶" },
    ])
    const controller = new AbortController()

    const promise = greetWelcome(ports, MATERIAL, controller.signal, NO_TIMEOUT)
    controller.abort()
    await promise
    queries[0]?.fail()
    await flush()

    expect(emitted).toEqual([{ kind: "writing" }])
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

  it("4回とも問い合わせが失敗したら failed で知らせる", async () => {
    const { ports, queries, reported } = harness()

    const promise = greetWelcome(ports, MATERIAL, new AbortController().signal, NO_TIMEOUT)
    await failEach(queries, 4)
    await promise

    expect(reported.map((footprint) => footprint.outcome)).toEqual(["failed"])
    expect(reported[0]?.attempts.map((attempt) => attempt.result)).toEqual([
      "failed",
      "failed",
      "failed",
      "failed",
    ])
  })

  it("2回とも落ちて3回目で書ければ written で、起こした3回を知らせる", async () => {
    const { ports, queries, reported } = harness()

    const promise = greetWelcome(ports, MATERIAL, new AbortController().signal, NO_TIMEOUT)
    await failEach(queries, 2)
    expect(queries).toHaveLength(3)
    queries[2]?.settle(OUTPUT)
    await promise

    expect(reported.map((footprint) => footprint.outcome)).toEqual(["written"])
    expect(reported[0]?.attempts.map((attempt) => attempt.result)).toEqual([
      "failed",
      "failed",
      "written",
    ])
  })

  it("締め切りが来たら、次の回を起こさない", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    try {
      const { ports, queries, reported } = harness()

      const promise = greetWelcome(ports, MATERIAL, new AbortController().signal, 1000)
      queries[0]?.fail()
      await vi.advanceTimersByTimeAsync(0)
      expect(queries).toHaveLength(2)
      await vi.advanceTimersByTimeAsync(1000)
      await promise

      expect(queries).toHaveLength(2)
      expect(reported.map((footprint) => footprint.outcome)).toEqual(["timed-out"])
    } finally {
      vi.useRealTimers()
    }
  })

  it("1回目が5秒経っても返らなければ2回目を並べ、2回目が先に書けたら1回目を中断して使う", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    try {
      const { ports, emitted, queries, reported, advance } = harness()

      const promise = greetWelcome(ports, MATERIAL, new AbortController().signal, NO_TIMEOUT)
      expect(queries).toHaveLength(1)
      advance(5000)
      await vi.advanceTimersByTimeAsync(5000)
      expect(queries).toHaveLength(2)
      advance(3000)
      queries[1]?.settle(OUTPUT)
      await promise

      expect(emitted).toEqual([{ kind: "writing" }, { kind: "written", greeting: OUTPUT }])
      expect(reported[0]?.outcome).toBe("written")
      expect(reported[0]?.attempts).toEqual([
        { result: "superseded", ms: 8000 },
        { result: "written", ms: 3000 },
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it("2回目を並べたあとでも、1回目が先に書ければ1回目を使う", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    try {
      const { ports, emitted, queries, reported } = harness()

      const promise = greetWelcome(ports, MATERIAL, new AbortController().signal, NO_TIMEOUT)
      await vi.advanceTimersByTimeAsync(5000)
      queries[0]?.settle(OUTPUT)
      await promise

      expect(emitted).toEqual([{ kind: "writing" }, { kind: "written", greeting: OUTPUT }])
      expect(reported[0]?.attempts.map((attempt) => attempt.result)).toEqual([
        "written",
        "superseded",
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it("1回目が5秒より前に書けなければ、待たずにすぐ2回目を起こす", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    try {
      const { ports, queries } = harness()

      void greetWelcome(ports, MATERIAL, new AbortController().signal, NO_TIMEOUT)
      queries[0]?.fail()
      await vi.advanceTimersByTimeAsync(0)

      expect(queries).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
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
