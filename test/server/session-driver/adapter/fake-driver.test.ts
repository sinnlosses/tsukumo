import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { pick } from "remeda"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  FAKE_DEFAULT_EFFORT,
  FAKE_MODEL_EFFORT_SUPPORT,
  readFakeSession,
  startFakeSession,
} from "../../../../src/server/session-driver/adapter/fake-driver.ts"
import { BUILTIN_SESSION_DEFAULT } from "../../../../src/shared/session/session-default.ts"
import {
  type SessionEvent,
  sessionEventSchema,
} from "../../../../src/shared/session/session-event.ts"
import { reportEvent } from "../../../fixture/report-event.ts"

// 疑似セッションは手で書いた架空の会話（test/fixture/fake-session.json）。実物の transcript は
const FAKE_SESSION = {
  opening: [
    {
      afterMs: 0,
      waitForAnswer: false,
      event: { kind: "speech", text: "架空の挨拶", expression: "default" },
    },
  ],
  turns: [
    {
      name: "架空の場面1",
      resume: undefined,
      steps: [
        { afterMs: 0, waitForAnswer: false, event: { kind: "utterance", text: "架空の本文" } },
        {
          afterMs: 0,
          waitForAnswer: false,
          event: { kind: "turn-finished", outcome: { kind: "completed" } },
        },
      ],
    },
    {
      name: "架空の場面2",
      resume: undefined,
      steps: [
        { afterMs: 0, waitForAnswer: false, event: { kind: "utterance", text: "架空の本文2" } },
      ],
    },
  ],
  pastSessions: [],
  sessionDigests: {
    "fake-other": {
      kind: "known",
      requestCount: 2,
      summary: "架空の要約",
      lastLine: "架空のセリフ",
    },
  },
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
      firstViewer: Promise.resolve(),
      expressions: [],
      onEvent: sink.onEvent,
    })
    await tick()
    driver.close()

    expect(sink.events).toEqual([
      { kind: "plan", plan: "Claude Max" },
      { kind: "model-effort-support", models: FAKE_MODEL_EFFORT_SUPPORT },
      { kind: "effort-changed", effort: FAKE_DEFAULT_EFFORT },
      { kind: "speech", text: "架空の挨拶", expression: "default" },
    ])
  })

  it("セッションの中身は疑似セッションに書いたものを返し、無いIDは「読めない」", async () => {
    const driver = startFakeSession({
      session: FAKE_SESSION,
      scene: undefined,
      sessionDefault: BUILTIN_SESSION_DEFAULT,
      firstViewer: Promise.resolve(),
      expressions: [],
      onEvent: () => {},
    })

    expect(await driver.readSessionDigest("fake-other")).toEqual(
      FAKE_SESSION.sessionDigests["fake-other"],
    )
    expect(await driver.readSessionDigest("fake-missing")).toEqual({ kind: "unavailable" })
    driver.close()
  })

  it("prompt で request を流してから、次の場面を流す", async () => {
    const sink = collect()
    const driver = startFakeSession({
      session: FAKE_SESSION,
      scene: undefined,
      sessionDefault: BUILTIN_SESSION_DEFAULT,
      firstViewer: Promise.resolve(),
      expressions: [],
      onEvent: sink.onEvent,
    })
    await tick()
    driver.prompt("架空の依頼", [], "request")
    await tick()
    driver.close()

    // 先頭4件は起こした直後の分（プラン・effort の対応・既定の effort・opening の場面）。
    expect(sink.events.slice(4)).toEqual([
      { kind: "request", text: "架空の依頼", images: [] },
      { kind: "utterance", text: "架空の本文" },
      { kind: "turn-finished", outcome: { kind: "completed" } },
      // ターンが終わったので、いま効いている effort が読めたことになる（13.9「動き方の操作子」）。
      { kind: "effort-changed", effort: FAKE_DEFAULT_EFFORT },
    ])
  })

  it("promptWithoutRecord は request を流さず、turn-started だけを流して次の場面へ進む", async () => {
    const sink = collect()
    const driver = startFakeSession({
      session: FAKE_SESSION,
      scene: undefined,
      sessionDefault: BUILTIN_SESSION_DEFAULT,
      firstViewer: Promise.resolve(),
      expressions: [],
      onEvent: sink.onEvent,
    })
    await tick()
    driver.promptWithoutRecord("架空の合図")
    await tick()
    driver.close()

    // 送った文面はどのイベントにも乗らない（docs/architecture/screen-design.md「雑談モードの画面」）。先頭4件は起こした直後の分
    // （プラン・effort の対応・既定の effort・opening の場面）。
    expect(sink.events.slice(4)).toEqual([
      { kind: "turn-started" },
      { kind: "utterance", text: "架空の本文" },
      { kind: "turn-finished", outcome: { kind: "completed" } },
      { kind: "effort-changed", effort: FAKE_DEFAULT_EFFORT },
    ])
  })

  it("session-ended の手を流したあとは ended が真になる", async () => {
    const sink = collect()
    const driver = startFakeSession({
      session: {
        ...FAKE_SESSION,
        turns: [
          {
            name: "架空の終了",
            resume: undefined,
            steps: [
              {
                afterMs: 0,
                waitForAnswer: false,
                event: { kind: "session-ended", reason: "架空の理由" },
              },
            ],
          },
        ],
      },
      scene: undefined,
      sessionDefault: BUILTIN_SESSION_DEFAULT,
      firstViewer: Promise.resolve(),
      expressions: [],
      onEvent: sink.onEvent,
    })
    await tick()
    expect(driver.ended()).toBe(false)
    driver.prompt("架空の依頼", [], "request")
    await tick()
    driver.close()

    expect(driver.ended()).toBe(true)
  })

  it("起こした直後に既定の effort を、setEffort のたびに受け付けた値を effort-changed で流す", async () => {
    const sink = collect()
    const driver = startFakeSession({
      session: FAKE_SESSION,
      scene: undefined,
      sessionDefault: BUILTIN_SESSION_DEFAULT,
      firstViewer: Promise.resolve(),
      expressions: [],
      onEvent: sink.onEvent,
    })
    await tick()
    expect(sink.events).toContainEqual({ kind: "effort-changed", effort: FAKE_DEFAULT_EFFORT })

    await driver.setEffort("xhigh")
    expect(sink.events.at(-1)).toEqual({ kind: "effort-changed", effort: "xhigh" })
    driver.close()
  })

  it("opening と名指しの場面は、最初のビューが繋がるまで流さない（プランと effort の対応は先に流す）", async () => {
    const sink = collect()
    const viewer = Promise.withResolvers<void>()
    const driver = startFakeSession({
      session: FAKE_SESSION,
      scene: "架空の場面2",
      sessionDefault: BUILTIN_SESSION_DEFAULT,
      firstViewer: viewer.promise,
      expressions: [],
      onEvent: sink.onEvent,
    })
    await tick()
    const beforeViewer = sink.events.length
    viewer.resolve()
    await tick()
    driver.close()

    expect(beforeViewer).toBe(3)
    expect(sink.events.slice(3)).toEqual([
      { kind: "speech", text: "架空の挨拶", expression: "default" },
      { kind: "utterance", text: "架空の本文2" },
    ])
  })

  it("scene で名指しした次の依頼は、その次の場面から続く（名指しした場面を繰り返さない）", async () => {
    const sink = collect()
    const driver = startFakeSession({
      session: FAKE_SESSION,
      scene: "架空の場面1",
      sessionDefault: BUILTIN_SESSION_DEFAULT,
      firstViewer: Promise.resolve(),
      expressions: [],
      onEvent: sink.onEvent,
    })
    await tick()
    driver.prompt("架空の依頼", [], "request")
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
      firstViewer: Promise.resolve(),
      expressions: [],
      onEvent: sink.onEvent,
    })
    await tick()
    driver.close()

    expect(sink.events).toEqual([
      { kind: "plan", plan: "Claude Max" },
      { kind: "model-effort-support", models: FAKE_MODEL_EFFORT_SUPPORT },
      { kind: "effort-changed", effort: FAKE_DEFAULT_EFFORT },
      { kind: "speech", text: "架空の挨拶", expression: "default" },
    ])
  })

  it("疑似セッションから積まれた答え待ちに答えると、列から消える", async () => {
    const sink = collect()
    const driver = startFakeSession({
      session: {
        sessionDigests: {},
        pastSessions: [],
        opening: [
          {
            afterMs: 0,
            waitForAnswer: false,
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
      firstViewer: Promise.resolve(),
      expressions: [],
      onEvent: sink.onEvent,
    })
    await tick()

    expect(driver.pending()).toHaveLength(1)
    expect(driver.answer("ask-2", { kind: "allow" })).toBe(false)
    expect(driver.answer("ask-1", { kind: "allow" })).toBe(true)
    expect(driver.pending()).toEqual([])
    driver.close()
  })

  describe("waitForAnswer の手", () => {
    function startAskThenFollow(
      sink: ReturnType<typeof collect>,
    ): ReturnType<typeof startFakeSession> {
      return startFakeSession({
        session: {
          sessionDigests: {},
          pastSessions: [],
          opening: [
            {
              afterMs: 0,
              waitForAnswer: false,
              event: {
                kind: "pending-changed",
                pending: [{ kind: "permission", id: "ask-1", toolName: "Bash", input: {} }],
              },
            },
            {
              afterMs: 5,
              waitForAnswer: true,
              event: { kind: "utterance", text: "答えのあとの本文" },
            },
          ],
          turns: [],
        },
        scene: undefined,
        sessionDefault: BUILTIN_SESSION_DEFAULT,
        firstViewer: Promise.resolve(),
        expressions: [],
        onEvent: sink.onEvent,
      })
    }

    it("答えが届くまで流さず、届いたら afterMs 後に流す", async () => {
      const sink = collect()
      const driver = startAskThenFollow(sink)
      await new Promise((resolve) => setTimeout(resolve, 60))

      expect(sink.events.some((event) => event.kind === "utterance")).toBe(false)

      driver.answer("ask-1", { kind: "allow" })
      expect(sink.events.some((event) => event.kind === "utterance")).toBe(false)
      await new Promise((resolve) => setTimeout(resolve, 60))

      expect(sink.events.at(-1)).toEqual({ kind: "utterance", text: "答えのあとの本文" })
      driver.close()
    })

    it("答えを待っているあいだに close したら、答えが届いても流さない", async () => {
      const sink = collect()
      const driver = startAskThenFollow(sink)
      await tick()

      driver.close()
      driver.answer("ask-1", { kind: "allow" })
      await new Promise((resolve) => setTimeout(resolve, 40))

      expect(sink.events.some((event) => event.kind === "utterance")).toBe(false)
    })
  })

  it("close したあとは疑似セッションの続きを流さない", async () => {
    const sink = collect()
    const driver = startFakeSession({
      session: {
        sessionDigests: {},
        pastSessions: [],
        opening: [
          {
            afterMs: 50,
            waitForAnswer: false,
            event: { kind: "utterance", text: "遅れて来る本文" },
          },
        ],
        turns: [],
      },
      scene: undefined,
      sessionDefault: BUILTIN_SESSION_DEFAULT,
      firstViewer: Promise.resolve(),
      expressions: [],
      onEvent: sink.onEvent,
    })
    driver.close()
    await new Promise((resolve) => setTimeout(resolve, 80))

    // プランと effort の対応は opening のタイマーより先、`close` より前に同期で流れる
    // （起こしたことそのものの合図なので、`close` で止められるのは疑似セッションの続きだけ）。
    expect(sink.events).toEqual([
      { kind: "plan", plan: "Claude Max" },
      { kind: "model-effort-support", models: FAKE_MODEL_EFFORT_SUPPORT },
      { kind: "effort-changed", effort: FAKE_DEFAULT_EFFORT },
    ])
  })

  it("report は結果が届くまで預かり、差し戻された（isError の）ものは流さない（本物の駆動と同じ）", async () => {
    const report = (toolUseId: string) => reportEvent({ toolUseId })
    const finished = (toolUseId: string, isError: boolean) =>
      ({ kind: "tool-finished", toolUseId, content: "架空の結果", isError }) as const
    const sink = collect()
    const driver = startFakeSession({
      session: {
        sessionDigests: {},
        pastSessions: [],
        opening: [],
        turns: [
          {
            name: "架空の差し戻し",
            resume: undefined,
            steps: [
              { afterMs: 0, waitForAnswer: false, event: report("fake-r1") },
              { afterMs: 1, waitForAnswer: false, event: finished("fake-r1", true) },
              { afterMs: 2, waitForAnswer: false, event: report("fake-r2") },
              { afterMs: 3, waitForAnswer: false, event: finished("fake-r2", false) },
            ],
          },
        ],
      },
      scene: "架空の差し戻し",
      sessionDefault: BUILTIN_SESSION_DEFAULT,
      firstViewer: Promise.resolve(),
      expressions: [],
      onEvent: sink.onEvent,
    })
    // この場面だけ手が afterMs: 0, 1, 2, 3 の4段で、実時間の setTimeout を3回跨ぐ。決め打ちの
    // 時間で待つと、負荷でイベントループが混み合ったときに最後の手を取りこぼす
    // （driver.close() が残りの手のタイマーを捨てる）ので、最後の手が実際に届くまで待つ。
    await vi.waitFor(() => {
      expect(sink.events).toContainEqual(finished("fake-r2", false))
    })
    driver.close()

    // 先頭3件は起こした直後の分（プラン・effort の対応・既定の effort。この疑似セッションは opening が空）。
    expect(sink.events.slice(3)).toEqual([
      finished("fake-r1", true),
      report("fake-r2"),
      finished("fake-r2", false),
    ])
  })

  it("report は本物と同じ検証と既定値の補いを通してから流れ、conclusion の無いものは流れない", async () => {
    // 疑似セッションの JSON は実行時に検証されないので、欄を省いた形を型の外から渡す。
    const partial = (event: object): SessionEvent => sessionEventSchema.parse(event)
    const sink = collect()
    const driver = startFakeSession({
      session: {
        sessionDigests: {},
        pastSessions: [],
        opening: [],
        turns: [
          {
            name: "架空の省略",
            resume: undefined,
            steps: [
              {
                afterMs: 0,
                waitForAnswer: false,
                event: partial({
                  ...pick(reportEvent({ toolUseId: "fake-r1" }), [
                    "kind",
                    "toolUseId",
                    "conclusion",
                  ]),
                  sections: [
                    { heading: "", blocks: [{ kind: "markdown", markdown: "本文", fold: "" }] },
                    { heading: "", blocks: [{ kind: "no-such-block" }] },
                  ],
                  closing: { kind: "speech", text: "書けたよ", expression: "知らない表情" },
                }),
              },
              {
                afterMs: 1,
                waitForAnswer: false,
                event: partial(pick(reportEvent({ toolUseId: "fake-r2" }), ["kind", "toolUseId"])),
              },
              {
                afterMs: 2,
                waitForAnswer: false,
                event: {
                  kind: "tool-finished",
                  toolUseId: "fake-r1",
                  content: "ok",
                  isError: false,
                },
              },
            ],
          },
        ],
      },
      scene: "架空の省略",
      sessionDefault: BUILTIN_SESSION_DEFAULT,
      firstViewer: Promise.resolve(),
      expressions: ["default"],
      onEvent: sink.onEvent,
    })
    await vi.waitFor(() => {
      expect(sink.events.map((event) => event.kind)).toContain("tool-finished")
    })
    driver.close()

    expect(sink.events.filter((event) => event.kind === "report")).toEqual([
      reportEvent({
        toolUseId: "fake-r1",
        sections: [{ heading: "", blocks: [{ kind: "markdown", markdown: "本文", fold: "" }] }],
        closing: { kind: "speech", text: "書けたよ", expression: "default" },
        unknownBlockCount: 1,
      }),
    ])
  })
})

describe("readFakeSession", () => {
  describe("読めないとき", () => {
    let directory: string

    beforeEach(() => {
      directory = mkdtempSync(path.join(tmpdir(), "tsukumo-fake-session-"))
    })

    afterEach(() => {
      rmSync(directory, { recursive: true, force: true })
    })

    function readWritten(content: string): ReturnType<typeof readFakeSession> {
      const file = path.join(directory, "session.json")
      writeFileSync(file, content)
      return readFakeSession(file)
    }

    function step(afterMs: number): unknown {
      return { afterMs, event: { kind: "utterance", text: "架空の本文" } }
    }

    function sessionJson(opening: readonly unknown[], steps: readonly unknown[]): string {
      return JSON.stringify({ opening, turns: [{ name: "架空の場面", steps }] })
    }

    it("無いファイルは unreadable", () => {
      expect(readFakeSession(path.join(directory, "none.json")).kind).toBe("unreadable")
    })

    it("JSON でないものと形の違う JSON は unreadable", () => {
      expect(readWritten("{").kind).toBe("unreadable")
      expect(readWritten("{}").kind).toBe("unreadable")
    })

    it("場面の中で afterMs が手の並びの順に減ると、場面名と手の位置つきで拒む", () => {
      const reading = readWritten(sessionJson([], [step(0), step(300), step(100)]))

      expect(reading.kind).toBe("unreadable")
      expect(reading.kind === "unreadable" ? reading.reason : "").toMatch(/場面 架空の場面 の手 2/)
    })

    it("opening の中で afterMs が減ると、opening と手の位置つきで拒む", () => {
      const reading = readWritten(sessionJson([step(200), step(100)], []))

      expect(reading.kind).toBe("unreadable")
      expect(reading.kind === "unreadable" ? reading.reason : "").toMatch(/opening の手 1/)
    })

    it("waitForAnswer の手は時刻の数え直しなので、前の手より afterMs が小さくても読める", () => {
      const waiting = {
        afterMs: 100,
        waitForAnswer: true,
        event: { kind: "utterance", text: "架空の本文" },
      }

      expect(readWritten(sessionJson([], [step(0), step(300), waiting, step(200)])).kind).toBe(
        "read",
      )
    })

    it("afterMs が同じ値で続く場面と、手が0本・1本の場面は読める", () => {
      expect(readWritten(sessionJson([], [step(0), step(0), step(200), step(200)])).kind).toBe(
        "read",
      )
      expect(readWritten(sessionJson([step(5)], [])).kind).toBe("read")
    })
  })
})
