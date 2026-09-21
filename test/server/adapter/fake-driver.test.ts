import { describe, expect, it } from "bun:test"

import { readFakeScript, startFakeSession } from "../../../src/server/adapter/fake-driver.ts"
import { type SessionEvent } from "../../../src/shared/session-event.ts"

// 台本は手で書いた架空の会話（test/fixture/fake-session.json）。実物の transcript は使わない
// （docs/coding-standards.md「会話内容の扱い」）。
const SCRIPT = {
  opening: [{ afterMs: 0, event: { kind: "speech", text: "架空の挨拶", expression: "default" } }],
  turns: [
    {
      name: "架空の場面1",
      steps: [
        { afterMs: 0, event: { kind: "utterance", text: "架空の本文" } },
        { afterMs: 0, event: { kind: "turn-finished", status: "success" } },
      ],
    },
    {
      name: "架空の場面2",
      steps: [{ afterMs: 0, event: { kind: "utterance", text: "架空の本文2" } }],
    },
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
    const driver = startFakeSession({ script: SCRIPT, scene: undefined, onEvent: sink.onEvent })
    await tick()
    driver.close()

    expect(sink.events).toEqual([{ kind: "speech", text: "架空の挨拶", expression: "default" }])
  })

  it("prompt で request を流してから、次の場面を流す", async () => {
    const sink = collect()
    const driver = startFakeSession({ script: SCRIPT, scene: undefined, onEvent: sink.onEvent })
    await tick()
    driver.prompt("架空の依頼", [])
    await tick()
    driver.close()

    expect(sink.events.slice(1)).toEqual([
      { kind: "request", text: "架空の依頼", images: [] },
      { kind: "utterance", text: "架空の本文" },
      { kind: "turn-finished", status: "success" },
    ])
  })

  it("promptWithoutRecord は request を流さず、turn-started だけを流して次の場面へ進む", async () => {
    const sink = collect()
    const driver = startFakeSession({ script: SCRIPT, scene: undefined, onEvent: sink.onEvent })
    await tick()
    driver.promptWithoutRecord("架空の合図")
    await tick()
    driver.close()

    // 送った文面はどのイベントにも乗らない（docs/design.md 13.7）。
    expect(sink.events.slice(1)).toEqual([
      { kind: "turn-started" },
      { kind: "utterance", text: "架空の本文" },
      { kind: "turn-finished", status: "success" },
    ])
  })

  it("scene で名指しした場面は、依頼を待たずに opening の続きとして流れる", async () => {
    const sink = collect()
    const driver = startFakeSession({ script: SCRIPT, scene: "架空の場面2", onEvent: sink.onEvent })
    await tick()
    driver.close()

    expect(sink.events.slice(1)).toEqual([{ kind: "utterance", text: "架空の本文2" }])
  })

  it("scene で名指しした次の依頼は、その次の場面から続く（名指しした場面を繰り返さない）", async () => {
    const sink = collect()
    const driver = startFakeSession({ script: SCRIPT, scene: "架空の場面1", onEvent: sink.onEvent })
    await tick()
    driver.prompt("架空の依頼", [])
    await tick()
    driver.close()

    expect(sink.events.at(-1)).toEqual({ kind: "utterance", text: "架空の本文2" })
  })

  it("台本に無い名前を名指ししても、opening だけを流す", async () => {
    const sink = collect()
    const driver = startFakeSession({ script: SCRIPT, scene: "無い場面", onEvent: sink.onEvent })
    await tick()
    driver.close()

    expect(sink.events).toEqual([{ kind: "speech", text: "架空の挨拶", expression: "default" }])
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
      scene: undefined,
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
      scene: undefined,
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
    // 場面の名前は、状態のカタログを撮る道具（scripts/capture-catalog.ts）が名指しする鍵。
    expect(script?.turns.map((scene) => scene.name)).toContain("question-multi")
  })

  it("無いファイル・形の違う JSON は undefined", () => {
    expect(readFakeScript("/tmp/tsukumo-no-such-script.json")).toBeUndefined()
  })
})
