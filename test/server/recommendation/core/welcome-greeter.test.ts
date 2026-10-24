import { describe, expect, it } from "vitest"

import { createWelcomeGreeter } from "../../../../src/server/recommendation/core/welcome-greeter.ts"
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

/** 挨拶の問い合わせか（反応の行の問い合わせは材料の節を持たない）。 */
function isGreetingQuery(query: { readonly prompt: string }): boolean {
  return query.prompt.startsWith("## 材料")
}

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
