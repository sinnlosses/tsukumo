import { describe, expect, it } from "bun:test"

import { readFakeScript, startFakeSession } from "../../src/core/fake-driver.ts"
import { type SessionEvent } from "../../src/protocol/session-event.ts"

// 台本は手で書いた架空の会話（test/fixture/fake-session.json）。実物の transcript は使わない
// （docs/coding-standards.md「会話内容の扱い」）。
const SCRIPT = {
  opening: [{ afterMs: 0, event: { kind: "speech", text: "架空の挨拶", expression: "default" } }],
  turns: [
    [
      { afterMs: 0, event: { kind: "utterance", text: "架空の本文" } },
      { afterMs: 0, event: { kind: "turn-finished", status: "success" } },
    ],
  ],
} as const

function collect(): {
  readonly events: SessionEvent[]
  readonly onEvent: (e: SessionEvent) => void
} {
  const events: SessionEvent[] = []
  return { events, onEvent: (event) => events.push(event) }
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10))
}

describe("startFakeSession", () => {
  it("起こした直後に opening の場面を流す", async () => {
    const sink = collect()
    const driver = startFakeSession({ script: SCRIPT, onEvent: sink.onEvent })
    await tick()
    driver.close()

    expect(sink.events).toEqual([{ kind: "speech", text: "架空の挨拶", expression: "default" }])
  })

  it("prompt で request を流してから、次の場面を流す", async () => {
    const sink = collect()
    const driver = startFakeSession({ script: SCRIPT, onEvent: sink.onEvent })
    await tick()
    driver.prompt("架空の依頼")
    await tick()
    driver.close()

    expect(sink.events.slice(1)).toEqual([
      { kind: "request", text: "架空の依頼" },
      { kind: "utterance", text: "架空の本文" },
      { kind: "turn-finished", status: "success" },
    ])
  })

  it("台本から積まれた答え待ちに答えると、列から消える", async () => {
    const sink = collect()
    const driver = startFakeSession({
      script: {
        opening: [
          {
            afterMs: 0,
            event: {
              kind: "pending-changed",
              pending: [{ kind: "permission", id: "ask-1", toolName: "Bash", input: {} }],
            },
          },
        ],
        turns: [],
      },
      onEvent: sink.onEvent,
    })
    await tick()

    expect(driver.pending()).toHaveLength(1)
    expect(driver.answer("ask-2", { kind: "allow" })).toBe(false)
    expect(driver.answer("ask-1", { kind: "allow" })).toBe(true)
    expect(driver.pending()).toEqual([])
    driver.close()
  })

  it("close したあとは台本の続きを流さない", async () => {
    const sink = collect()
    const driver = startFakeSession({
      script: {
        opening: [{ afterMs: 50, event: { kind: "utterance", text: "遅れて来る本文" } }],
        turns: [],
      },
      onEvent: sink.onEvent,
    })
    driver.close()
    await new Promise((resolve) => setTimeout(resolve, 80))

    expect(sink.events).toEqual([])
  })
})

describe("readFakeScript", () => {
  it("同梱の台本（test/fixture/fake-session.json）を読める", () => {
    const script = readFakeScript()

    expect(script?.opening.length).toBeGreaterThan(0)
    expect(script?.turns.length).toBeGreaterThan(0)
  })

  it("無いファイル・形の違う JSON は undefined", () => {
    expect(readFakeScript("/tmp/tsukumo-no-such-script.json")).toBeUndefined()
  })
})
