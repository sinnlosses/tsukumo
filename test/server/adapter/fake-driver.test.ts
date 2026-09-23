import { describe, expect, it } from "bun:test"

import { readFakeSession, startFakeSession } from "../../../src/server/adapter/fake-driver.ts"
import { BUILTIN_SESSION_DEFAULT } from "../../../src/shared/session-default.ts"
import { type SessionEvent } from "../../../src/shared/session-event.ts"

// 疑似セッションは手で書いた架空の会話（test/fixture/fake-session.json）。実物の transcript は
// 使わない（docs/coding-standards.md「会話内容の扱い」）。
const FAKE_SESSION = {
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
  it("起こした直後にプラン（docs/glossary.md「プラン」）を流し、続けて opening の場面を流す", async () => {
    const sink = collect()
    const driver = startFakeSession({
      session: FAKE_SESSION,
      scene: undefined,
      sessionDefault: BUILTIN_SESSION_DEFAULT,
      onEvent: sink.onEvent,
    })
    await tick()
    driver.close()

    expect(sink.events).toEqual([
      { kind: "plan", plan: "Claude Max" },
      { kind: "speech", text: "架空の挨拶", expression: "default" },
    ])
  })

  it("prompt で request を流してから、次の場面を流す", async () => {
    const sink = collect()
    const driver = startFakeSession({
      session: FAKE_SESSION,
      scene: undefined,
      sessionDefault: BUILTIN_SESSION_DEFAULT,
      onEvent: sink.onEvent,
    })
    await tick()
    driver.prompt("架空の依頼", [])
    await tick()
    driver.close()

    // 先頭2件は起こした直後の分（プランと opening の場面）。
    expect(sink.events.slice(2)).toEqual([
      { kind: "request", text: "架空の依頼", images: [] },
      { kind: "utterance", text: "架空の本文" },
      { kind: "turn-finished", status: "success" },
    ])
  })

  it("promptWithoutRecord は request を流さず、turn-started だけを流して次の場面へ進む", async () => {
    const sink = collect()
    const driver = startFakeSession({
      session: FAKE_SESSION,
      scene: undefined,
      sessionDefault: BUILTIN_SESSION_DEFAULT,
      onEvent: sink.onEvent,
    })
    await tick()
    driver.promptWithoutRecord("架空の合図")
    await tick()
    driver.close()

    // 送った文面はどのイベントにも乗らない（docs/screen-design.md 13.7）。先頭2件は起こした直後の分
    // （プランと opening の場面）。
    expect(sink.events.slice(2)).toEqual([
      { kind: "turn-started" },
      { kind: "utterance", text: "架空の本文" },
      { kind: "turn-finished", status: "success" },
    ])
  })

  it("scene で名指しした場面は、依頼を待たずに opening の続きとして流れる", async () => {
    const sink = collect()
    const driver = startFakeSession({
      session: FAKE_SESSION,
      scene: "架空の場面2",
      sessionDefault: BUILTIN_SESSION_DEFAULT,
      onEvent: sink.onEvent,
    })
    await tick()
    driver.close()

    // 先頭2件は起こした直後の分（プランと opening の場面）。
    expect(sink.events.slice(2)).toEqual([{ kind: "utterance", text: "架空の本文2" }])
  })

  it("scene で名指しした次の依頼は、その次の場面から続く（名指しした場面を繰り返さない）", async () => {
    const sink = collect()
    const driver = startFakeSession({
      session: FAKE_SESSION,
      scene: "架空の場面1",
      sessionDefault: BUILTIN_SESSION_DEFAULT,
      onEvent: sink.onEvent,
    })
    await tick()
    driver.prompt("架空の依頼", [])
    await tick()
    driver.close()

    expect(sink.events.at(-1)).toEqual({ kind: "utterance", text: "架空の本文2" })
  })

  it("疑似セッションに無い名前を名指ししても、opening だけを流す", async () => {
    const sink = collect()
    const driver = startFakeSession({
      session: FAKE_SESSION,
      scene: "無い場面",
      sessionDefault: BUILTIN_SESSION_DEFAULT,
      onEvent: sink.onEvent,
    })
    await tick()
    driver.close()

    expect(sink.events).toEqual([
      { kind: "plan", plan: "Claude Max" },
      { kind: "speech", text: "架空の挨拶", expression: "default" },
    ])
  })

  it("疑似セッションから積まれた答え待ちに答えると、列から消える", async () => {
    const sink = collect()
    const driver = startFakeSession({
      session: {
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
      sessionDefault: BUILTIN_SESSION_DEFAULT,
      onEvent: sink.onEvent,
    })
    await tick()

    expect(driver.pending()).toHaveLength(1)
    expect(driver.answer("ask-2", { kind: "allow" })).toBe(false)
    expect(driver.answer("ask-1", { kind: "allow" })).toBe(true)
    expect(driver.pending()).toEqual([])
    driver.close()
  })

  it("close したあとは疑似セッションの続きを流さない", async () => {
    const sink = collect()
    const driver = startFakeSession({
      session: {
        opening: [{ afterMs: 50, event: { kind: "utterance", text: "遅れて来る本文" } }],
        turns: [],
      },
      scene: undefined,
      sessionDefault: BUILTIN_SESSION_DEFAULT,
      onEvent: sink.onEvent,
    })
    driver.close()
    await new Promise((resolve) => setTimeout(resolve, 80))

    // プランは opening のタイマーより先、`close` より前に同期で流れる（起こしたことそのものの
    // 合図なので、`close` で止められるのは疑似セッションの続きだけ）。
    expect(sink.events).toEqual([{ kind: "plan", plan: "Claude Max" }])
  })

  it("report は結果が届くまで預かり、差し戻された（isError の）ものは流さない（本物の駆動と同じ）", async () => {
    const report = (toolUseId: string) =>
      ({ kind: "report", toolUseId, conclusion: "架空の結論", body: "", favor: "" }) as const
    const finished = (toolUseId: string, isError: boolean) =>
      ({ kind: "tool-finished", toolUseId, content: "架空の結果", isError }) as const
    const sink = collect()
    const driver = startFakeSession({
      session: {
        opening: [],
        turns: [
          {
            name: "架空の差し戻し",
            steps: [
              { afterMs: 0, event: report("fake-r1") },
              { afterMs: 1, event: finished("fake-r1", true) },
              { afterMs: 2, event: report("fake-r2") },
              { afterMs: 3, event: finished("fake-r2", false) },
            ],
          },
        ],
      },
      scene: "架空の差し戻し",
      sessionDefault: BUILTIN_SESSION_DEFAULT,
      onEvent: sink.onEvent,
    })
    await tick()
    driver.close()

    expect(sink.events.slice(1)).toEqual([
      finished("fake-r1", true),
      report("fake-r2"),
      finished("fake-r2", false),
    ])
  })
})

describe("readFakeSession", () => {
  it("同梱の疑似セッション（test/fixture/fake-session.json）を読める", () => {
    const session = readFakeSession()

    expect(session?.opening.length).toBeGreaterThan(0)
    expect(session?.turns.length).toBeGreaterThan(0)
    // 場面の名前は、状態のカタログを撮る道具（scripts/capture-catalog.ts）が名指しする鍵。
    expect(session?.turns.map((scene) => scene.name)).toContain("question-multi")
  })

  it("無いファイル・形の違う JSON は undefined", () => {
    expect(readFakeSession("/tmp/tsukumo-no-such-session.json")).toBeUndefined()
  })
})
