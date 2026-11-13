import { describe, expect, it } from "vitest"

import { createWelcomeGreeter } from "../../../../src/server/welcome-greeting/core/welcome-greeter.ts"
import {
  flushWelcomeWriting as flush,
  welcomeGreeterHarness as harness,
  WELCOME_MATERIAL as MATERIAL,
  WELCOME_OUTPUT as OUTPUT,
} from "../../../fixture/welcome-greeter.ts"

// すべて手で書いた架空の出力。

const REACTIONS = {
  retrying: { text: "架空の再試行", expression: "default" },
  failed: { text: "架空の失敗", expression: "default" },
  limited: { text: "架空の上限", expression: "default" },
  idle: { text: "架空の待ち", expression: "default" },
}

const AIZUCHI_PAIR = { chip: "架空の札", reply: "架空の返事", expression: "default" }
const AIZUCHI = {
  deliver: [AIZUCHI_PAIR, AIZUCHI_PAIR, AIZUCHI_PAIR],
  stumble: [AIZUCHI_PAIR, AIZUCHI_PAIR, AIZUCHI_PAIR],
  work: [AIZUCHI_PAIR, AIZUCHI_PAIR, AIZUCHI_PAIR],
}

function isGreetingQuery(query: { readonly kind: string }): boolean {
  return query.kind === "welcome-greeting"
}

function isReactionsQuery(query: { readonly kind: string }): boolean {
  return query.kind === "welcome-reactions"
}

describe("createWelcomeGreeter", () => {
  it("start は挨拶の答えを待たずに、反応の行と相づちの問い合わせも別々に同時に起こす", () => {
    const { ports, queries } = harness()

    createWelcomeGreeter(ports).start(MATERIAL)

    expect(queries.map((query) => query.kind)).toEqual([
      "welcome-greeting",
      "welcome-reactions",
      "aizuchi",
    ])
  })

  it("rewriteGreeting は挨拶だけを問い合わせ、反応の行と相づちの問い合わせを起こさない", () => {
    const { ports, queries } = harness()
    const greeter = createWelcomeGreeter(ports)

    greeter.start(MATERIAL)
    greeter.rewriteGreeting(MATERIAL)

    expect(queries.map((query) => query.kind)).toEqual([
      "welcome-greeting",
      "welcome-reactions",
      "aizuchi",
      "welcome-greeting",
    ])
  })

  it("相づちが書ければ配り、足跡の対象は aizuchi になる", async () => {
    const { ports, queries, aizuchi, reported } = harness()

    createWelcomeGreeter(ports).start(MATERIAL)
    queries[2]?.settle(AIZUCHI)
    await flush()

    expect(aizuchi).toEqual([AIZUCHI])
    expect(reported.map((footprint) => [footprint.target, footprint.outcome])).toEqual([
      ["aizuchi", "written"],
    ])
  })

  it("相づちの1組が知らない表情なら全部を落として配らず、相づちの場所で知らせる", async () => {
    const { ports, queries, aizuchi, reactions, unwritten } = harness()

    createWelcomeGreeter(ports).start(MATERIAL)
    queries[1]?.settle(REACTIONS)
    queries[2]?.settle({
      ...AIZUCHI,
      work: [AIZUCHI_PAIR, AIZUCHI_PAIR, { ...AIZUCHI_PAIR, expression: "架空の知らない表情" }],
    })
    await flush()
    for (let index = 1; index < 4; index += 1) {
      queries.filter((query) => query.kind === "aizuchi")[index]?.settle({})
      await flush()
    }

    expect(aizuchi).toEqual([])
    expect(reactions).toEqual([REACTIONS])
    expect(unwritten.map((entry) => entry.place)).toEqual(["aizuchi-rejected"])
  })

  it("挨拶が書けなくても、反応の行が書ければ配る", async () => {
    const { ports, queries, emitted, reactions, reported } = harness()

    createWelcomeGreeter(ports).start(MATERIAL)
    queries[1]?.settle(REACTIONS)
    for (let index = 0; index < 4; index += 1) {
      queries.filter(isGreetingQuery)[index]?.fail()
      await flush()
    }

    expect(emitted).toEqual([{ kind: "writing" }, { kind: "unwritten" }])
    expect(reactions).toEqual([REACTIONS])
    expect(reported.map((footprint) => [footprint.target, footprint.outcome])).toEqual([
      ["reactions", "written"],
      ["greeting", "failed"],
    ])
  })

  it("反応の行が4回とも書けなければ配らず、反応の場所で知らせる", async () => {
    const { ports, queries, emitted, reactions, unwritten } = harness()

    createWelcomeGreeter(ports).start(MATERIAL)
    queries[0]?.settle(OUTPUT)
    queries[1]?.settle({ ...REACTIONS, idle: { text: "", expression: "default" } })
    await flush()
    for (let index = 1; index < 4; index += 1) {
      queries.filter(isReactionsQuery)[index]?.settle({})
      await flush()
    }

    expect(emitted).toEqual([{ kind: "writing" }, { kind: "written", greeting: OUTPUT }])
    expect(reactions).toEqual([])
    expect(unwritten.map((entry) => entry.place)).toEqual(["welcome-reactions-rejected"])
  })
})
