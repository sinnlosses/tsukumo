import { pick } from "remeda"
import { describe, expect, it, vi } from "vitest"

import { startFakeSession } from "../../../../src/server/session-driver/adapter/fake-driver.ts"
import { FAKE_DEFAULT_EFFORT } from "../../../../src/server/session-driver/adapter/fake-fixed-reply.ts"
import type { SessionDriver } from "../../../../src/server/session-driver/core/session-driver.ts"
import { BUILTIN_SESSION_DEFAULT } from "../../../../src/shared/session/session-default.ts"
import {
  type SessionEvent,
  sessionEventSchema,
} from "../../../../src/shared/session/session-event.ts"
import {
  collect,
  confirmedAtTurnStart,
  FAKE_SESSION,
  sessionOfOnly,
  STARTUP_EVENTS,
  startOnScene,
  startWithoutScene,
  tick,
} from "../../../fixture/fake-driver.ts"
import { reportEvent } from "../../../fixture/report-event.ts"

describe("startFakeSession", () => {
  it.each([
    ["場面を名指ししない", undefined],
    ["疑似セッションに無い名前を名指しする", "無い場面"],
  ])(
    "起こした直後にプラン（docs/glossary.md「プラン」）を流し、続けて opening の場面だけを流す（%s）",
    async (_, scene) => {
      const sink = collect()
      const driver =
        scene === undefined
          ? startWithoutScene(FAKE_SESSION, sink.onEvent)
          : startOnScene(FAKE_SESSION, sink.onEvent, scene, undefined)
      await tick()
      driver.close()

      expect(sink.events).toEqual(STARTUP_EVENTS)
    },
  )

  it("セッションの中身は疑似セッションに書いたものを返し、無いIDは「読めない」", async () => {
    const driver = startWithoutScene(FAKE_SESSION, () => {})

    expect(await driver.readSessionDigest("fake-other")).toEqual(
      FAKE_SESSION.sessionDigests["fake-other"],
    )
    expect(await driver.readSessionDigest("fake-missing")).toEqual({ kind: "unavailable" })
    driver.close()
  })

  it.each([
    [
      "prompt で request を流してから、次の場面を流す",
      (driver: SessionDriver) => driver.prompt("架空の依頼", [], "request"),
      { kind: "request", text: "架空の依頼", images: [] },
    ],
    [
      // 送った文面はどのイベントにも乗らない（docs/architecture/screen-design.md「雑談モードの画面」）。
      "promptWithoutRecord は request を流さず、turn-started だけを流して次の場面へ進む",
      (driver: SessionDriver) => driver.promptWithoutRecord("架空の合図"),
      { kind: "turn-started" },
    ],
  ] as const)("%s", async (_, send, head) => {
    const sink = collect()
    const driver = startWithoutScene(FAKE_SESSION, sink.onEvent)
    await tick()
    send(driver)
    await tick()
    driver.close()

    expect(sink.events.slice(STARTUP_EVENTS.length)).toEqual([
      head,
      ...confirmedAtTurnStart(),
      { kind: "utterance", text: "架空の本文" },
      { kind: "turn-finished", outcome: { kind: "completed" } },
      // ターンが終わったので、いま効いている effort を見届けたことになる（13.9「動き方の操作子」）。
      { kind: "setting-confirmed", setting: "effort", value: FAKE_DEFAULT_EFFORT },
    ])
  })

  it("切り替えを受け付けたあと、次のターンの頭で切り替えた値を見届ける", async () => {
    const sink = collect()
    const driver = startWithoutScene(FAKE_SESSION, sink.onEvent)
    await tick()
    await driver.setPermissionMode("plan")
    await driver.setEffort("xhigh")
    expect(sink.events).toContainEqual({ kind: "permission-mode-changed", mode: "plan" })
    expect(sink.events.at(-1)).toEqual({ kind: "effort-changed", effort: "xhigh" })
    expect(sink.events.some((event) => event.kind === "setting-confirmed")).toBe(false)

    driver.prompt("架空の依頼", [], "request")
    await tick()
    driver.close()

    expect(sink.events).toContainEqual({
      kind: "setting-confirmed",
      setting: "permissionMode",
      value: "plan",
    })
    expect(sink.events).toContainEqual({
      kind: "setting-confirmed",
      setting: "effort",
      value: "xhigh",
    })
  })

  it("切り替えで流す session-info は、場面が流したスキルとエージェントの名前を保つ", async () => {
    const sink = collect()
    const driver = startWithoutScene(
      {
        ...FAKE_SESSION,
        opening: [
          {
            afterMs: 0,
            waitForAnswer: false,
            event: {
              kind: "session-info",
              sessionId: "fake-session",
              model: undefined,
              permissionMode: undefined,
              slashCommands: [],
              terminalSlashCommands: [],
              skillNames: ["架空のスキル"],
              agentNames: ["架空のプラグイン:架空の役"],
            },
          },
        ],
      },
      sink.onEvent,
    )
    await tick()
    await driver.setModel("sonnet")
    await driver.setPermissionMode("plan")
    driver.close()

    const infos = sink.events.filter((event) => event.kind === "session-info")
    expect(infos).toHaveLength(3)
    for (const info of infos) {
      expect(info).toMatchObject({
        skillNames: ["架空のスキル"],
        agentNames: ["架空のプラグイン:架空の役"],
      })
    }
  })

  it("session-ended の手を流したあとは ended が真になる", async () => {
    const sink = collect()
    const driver = startWithoutScene(
      {
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
      sink.onEvent,
    )
    await tick()
    expect(driver.ended()).toBe(false)
    driver.prompt("架空の依頼", [], "request")
    await tick()
    driver.close()

    expect(driver.ended()).toBe(true)
  })

  it("opening と名指しの場面は、最初のビューが繋がるまで流さない（プランと effort の対応は先に流す）", async () => {
    const sink = collect()
    const viewer = Promise.withResolvers<void>()
    const driver = startFakeSession({
      session: FAKE_SESSION,
      scene: "架空の場面2",
      sceneUntil: undefined,
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
    const driver = startOnScene(FAKE_SESSION, sink.onEvent, "架空の場面1", undefined)
    await tick()
    driver.prompt("架空の依頼", [], "request")
    await tick()
    driver.close()

    expect(sink.events.at(-1)).toEqual({ kind: "utterance", text: "架空の本文2" })
  })

  it("sceneUntil を渡すと、名指しした場面の手を先頭からその個数で止める（opening は流す）", async () => {
    const sink = collect()
    const driver = startOnScene(FAKE_SESSION, sink.onEvent, "架空の場面1", 1)
    await tick()
    driver.close()

    expect(sink.events.slice(3)).toEqual([
      { kind: "speech", text: "架空の挨拶", expression: "default" },
      { kind: "utterance", text: "架空の本文" },
    ])
  })

  it("疑似セッションから積まれた答え待ちに答えると、列から消える", async () => {
    const driver = startWithoutScene(
      sessionOfOnly(
        [
          {
            afterMs: 0,
            waitForAnswer: false,
            event: {
              kind: "pending-changed",
              pending: [{ kind: "permission", id: "ask-1", toolName: "Bash", input: {} }],
            },
          },
        ],
        [],
      ),
      () => {},
    )
    await tick()

    expect(driver.pending()).toHaveLength(1)
    expect(driver.answer("ask-2", { kind: "allow" })).toBe(false)
    expect(driver.answer("ask-1", { kind: "allow" })).toBe(true)
    expect(driver.pending()).toEqual([])
    driver.close()
  })

  describe("waitForAnswer の手", () => {
    function startAskThenFollow(sink: ReturnType<typeof collect>): SessionDriver {
      return startWithoutScene(
        sessionOfOnly(
          [
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
          [],
        ),
        sink.onEvent,
      )
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
    const driver = startWithoutScene(
      sessionOfOnly(
        [
          {
            afterMs: 50,
            waitForAnswer: false,
            event: { kind: "utterance", text: "遅れて来る本文" },
          },
        ],
        [],
      ),
      sink.onEvent,
    )
    driver.close()
    await new Promise((resolve) => setTimeout(resolve, 80))

    // プランと effort の対応は opening のタイマーより先、`close` より前に同期で流れる
    // （起こしたことそのものの合図なので、`close` で止められるのは疑似セッションの続きだけ）。
    expect(sink.events).toEqual(STARTUP_EVENTS.slice(0, 3))
  })

  it("report は結果が届くまで預かり、差し戻された（isError の）ものは流さない（本物の駆動と同じ）", async () => {
    const report = (toolUseId: string) =>
      reportEvent({
        toolUseId,
        argumentChars: expect.objectContaining({ total: expect.any(Number) }),
      })
    const finished = (toolUseId: string, isError: boolean) =>
      ({ kind: "tool-finished", toolUseId, content: "架空の結果", isError }) as const
    const sink = collect()
    const driver = startOnScene(
      sessionOfOnly(
        [],
        [
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
      ),
      sink.onEvent,
      "架空の差し戻し",
      undefined,
    )
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
      {
        kind: "report-rejected",
        reasons: ["tool-error"],
        argumentChars: expect.objectContaining({ total: expect.any(Number) }),
        inheritedFields: [],
      },
      report("fake-r2"),
      finished("fake-r2", false),
    ])
  })

  it("report は本物と同じ検証を通してから流れ、締めの表情をキャラクターパックに合わせ、conclusion の無いものは流れない", async () => {
    // 疑似セッションの JSON は実行時に検証されないので、欄を省いた形を型の外から渡す。
    const partial = (event: object): SessionEvent => sessionEventSchema.parse(event)
    const sink = collect()
    const driver = startFakeSession({
      session: sessionOfOnly(
        [],
        [
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
      ),
      scene: "架空の省略",
      sceneUntil: undefined,
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
        argumentChars: expect.objectContaining({ total: expect.any(Number) }),
        closing: { kind: "speech", text: "書けたよ", expression: "default" },
      }),
    ])
  })
})
