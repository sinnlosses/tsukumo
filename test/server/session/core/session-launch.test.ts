import { describe, expect, it } from "vitest"

import { createSessionCatalog } from "../../../../src/server/session-driver/core/session-catalog.ts"
import { sessionTag } from "../../../../src/server/session-driver/core/session-mark.ts"
import {
  createSessionLaunch,
  type SessionLaunchPorts,
  type SessionLaunchRequest,
} from "../../../../src/server/session/core/session-launch.ts"
import type { RestoredEvent, SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { knownRestored } from "../../../fixture/restored-event.ts"
import {
  CHAT_TOPICS,
  CHOICES,
  createHarness,
  createStubDriver,
  modeOf,
  type Pack,
  PREVIOUS_WORK,
  REMEMBERED_LINES,
  settle,
} from "../../../fixture/session-launch.ts"

describe("createSessionLaunch", () => {
  it("新規で起こすと、前のセッションを探さず、履歴を流さない", async () => {
    const harness = createHarness()

    await createSessionLaunch(harness.ports)(harness.receive, harness.receiveRestored, {
      selection: { by: "initial" },
      chat: undefined,
      resume: { by: "new" },
    })
    await settle()

    expect(harness.calls).toEqual([
      "choosePack:initial",
      "readSessionDefault",
      "listSessions:tsukumo-spirit:work",
      "startDriver:tsukumo-spirit:work:",
      "refreshSessions",
    ])
    expect(harness.events.map((event) => event.kind)).toEqual([
      "character-changed",
      "items-changed",
      "chat-mode-changed",
      "session-default-changed",
      "sessions-changed",
    ])
    expect(harness.driverEvents).toContainEqual({
      kind: "sessions-changed",
      sessions: CHOICES,
      current: undefined,
    })
  })

  it("駆動を返す前に、続きの履歴を流し終えている", async () => {
    // 読み終わるのがタイマーの後になる再生。待たずに返すと、返った時点ではまだ流れていない。
    const harness = createHarness({
      restoreEvents: () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve(knownRestored([{ kind: "utterance", text: "架空のターンの本文" }]))
          }, 0)
        }),
    })

    await createSessionLaunch(harness.ports)(harness.receive, harness.receiveRestored, {
      selection: { by: "current" },
      chat: true,
      resume: PREVIOUS_WORK,
    })

    // 起こし直しの `hello` はここで配られる（session-manager の restart）ので、履歴が
    // 入っていないと画面は既定の表情で描いたあとに続きの表情へもう一度飛ぶ。
    expect(harness.restoredEvents.map((event) => event.kind)).toEqual(["utterance"])
  })

  it("再生が失敗しても駆動は動き続ける", async () => {
    const harness = createHarness({
      restoreEvents: () => Promise.reject(new Error("架空の読み取り失敗")),
    })

    const driver = await createSessionLaunch(harness.ports)(
      harness.receive,
      harness.receiveRestored,
      {
        selection: { by: "initial" },
        chat: undefined,
        resume: PREVIOUS_WORK,
      },
    )
    await settle()
    driver.prompt("架空の依頼", [], "request")

    expect(harness.events.map((event) => event.kind)).toEqual([
      "character-changed",
      "items-changed",
      "chat-mode-changed",
      "session-default-changed",
      "sessions-changed",
    ])
    expect(harness.stub.calls).toEqual(["prompt:架空の依頼"])
    expect(harness.diagnosticEntries).toEqual([
      {
        flow: "swallowed-failure",
        at: 1_000,
        place: { feature: "session", place: "restore-events" },
        errorName: "Error",
        errorCode: "none",
      },
    ])
  })

  it("画面から選んで起こし直したときだけ、そのパックを覚える", async () => {
    const harness = createHarness()

    await createSessionLaunch(harness.ports)(harness.receive, harness.receiveRestored, {
      selection: { by: "name", name: "kagami" },
      chat: undefined,
      resume: PREVIOUS_WORK,
    })
    await settle()

    expect(harness.calls).toContain("rememberPack:kagami")
    expect(harness.calls).toContain("startDriver:kagami:work:prev-work-session")
  })

  it("雑談で新規に起こすと、雑談の駆動を新規で起こす（仕事の続きを拾わない）", async () => {
    const harness = createHarness()

    await createSessionLaunch(harness.ports)(harness.receive, harness.receiveRestored, {
      selection: { by: "initial" },
      chat: true,
      resume: { by: "new" },
    })
    await settle()

    expect(harness.calls).toEqual([
      "choosePack:initial",
      "readChatTopics:tsukumo-spirit",
      "readRememberedLines:tsukumo-spirit",
      "readSessionDefault",
      "listSessions:tsukumo-spirit:chat",
      "startDriver:tsukumo-spirit:chat:",
      "refreshSessions",
    ])
  })

  it("雑談で起こすと、写しから取り出した最近の話題と覚えたことの一覧を chat-mode-changed のすぐあとに順に流す", async () => {
    const harness = createHarness()

    await createSessionLaunch(harness.ports)(harness.receive, harness.receiveRestored, {
      selection: { by: "initial" },
      chat: true,
      resume: PREVIOUS_WORK,
    })
    await settle()

    const modeChangedAt = harness.driverEvents.findIndex(
      (event) => event.kind === "chat-mode-changed",
    )
    expect(harness.driverEvents.slice(modeChangedAt + 1, modeChangedAt + 3)).toEqual([
      { kind: "chat-topics-changed", topics: CHAT_TOPICS },
      { kind: "remembered-lines-changed", lines: REMEMBERED_LINES },
    ])
  })

  it("仕事で起こすときは写しを読まず、最近の話題も覚えたことも流さない", async () => {
    const harness = createHarness()

    await createSessionLaunch(harness.ports)(harness.receive, harness.receiveRestored, {
      selection: { by: "initial" },
      chat: false,
      resume: PREVIOUS_WORK,
    })
    await settle()

    expect(harness.calls.some((call) => call.startsWith("readChatTopics:"))).toBe(false)
    expect(harness.calls.some((call) => call.startsWith("readRememberedLines:"))).toBe(false)
    expect(harness.events.some((event) => event.kind === "chat-topics-changed")).toBe(false)
    expect(harness.events.some((event) => event.kind === "remembered-lines-changed")).toBe(false)
  })

  it("画面から選んだセッションは、そのIDの続きから起こす", async () => {
    const harness = createHarness()

    await createSessionLaunch(harness.ports)(harness.receive, harness.receiveRestored, {
      selection: { by: "current" },
      chat: undefined,
      resume: { by: "id", sessionId: "other-session" },
    })
    await settle()

    expect(harness.calls).toEqual([
      "choosePack:current",
      "readSessionDefault",
      "listSessions:tsukumo-spirit:work",
      "startDriver:tsukumo-spirit:work:other-session",
      "restoreEvents:other-session",
      "refreshSessions",
    ])
    expect(harness.driverEvents).toContainEqual({
      kind: "sessions-changed",
      sessions: CHOICES,
      current: "other-session",
    })
  })

  it("起こし直しは transcript の一覧を読まず、読み直しを待たずに駆動を返す", async () => {
    const calls: string[] = []
    // 最初の1回だけ読み終わり、読み直しはいつまでも終わらない。
    let reads = 0
    const catalog = createSessionCatalog({
      read: () => {
        reads += 1
        calls.push("read")
        return reads === 1
          ? Promise.resolve([
              {
                sessionId: "s-work",
                lastModified: 200,
                cwd: "/work/fictional",
                tag: sessionTag("tsukumo-spirit", false, 7327),
              },
              {
                sessionId: "s-chat",
                lastModified: 100,
                cwd: "/work/fictional",
                tag: sessionTag("tsukumo-spirit", true, 7327),
              },
            ])
          : new Promise(() => {})
      },
      now: () => 1_000,
      cwd: "/work/fictional",
    })
    const harness = createHarness({
      listSessions: (pack, chat) => catalog.listChoices(sessionTag(pack.name, chat, 7327)),
      refreshSessions: () => catalog.refresh(),
      startDriver: (seed) => {
        const resumeId = seed.start.kind === "resume" ? seed.start.sessionId : ""
        calls.push(`startDriver:${modeOf(seed.chat)}:${resumeId}`)
        return harness.stub.driver
      },
    })
    const launch = createSessionLaunch(harness.ports)
    await launch(harness.receive, harness.receiveRestored, {
      selection: { by: "initial" },
      chat: undefined,
      resume: { by: "new" },
    })
    calls.length = 0

    await launch(harness.receive, harness.receiveRestored, {
      selection: { by: "current" },
      chat: true,
      resume: { by: "new" },
    })
    await launch(harness.receive, harness.receiveRestored, {
      selection: { by: "current" },
      chat: false,
      resume: { by: "new" },
    })

    // 読むのは駆動を起こしたあとの読み直しだけで、どちらの起こし直しもそれを待たずに返っている。
    expect(calls).toEqual(["startDriver:chat:", "read", "startDriver:work:", "read"])
  })

  it("読み直しが終わったら、読み直した切り替え先の一覧をもう一度流す", async () => {
    const refreshed = [{ ...CHOICES[0], heading: "架空の見出しその3" }]
    let refreshedYet = false
    const harness = createHarness({
      refreshSessions: () => {
        refreshedYet = true
        return Promise.resolve("refreshed")
      },
      listSessions: () => Promise.resolve(refreshedYet ? refreshed : CHOICES),
    })

    await createSessionLaunch(harness.ports)(harness.receive, harness.receiveRestored, {
      selection: { by: "initial" },
      chat: undefined,
      resume: PREVIOUS_WORK,
    })
    await settle()

    expect(harness.driverEvents.filter((event) => event.kind === "sessions-changed")).toEqual([
      { kind: "sessions-changed", sessions: CHOICES, current: "prev-work-session" },
      { kind: "sessions-changed", sessions: refreshed, current: "prev-work-session" },
    ])
  })

  it("読み直した一覧を採らなかったときは、切り替え先の一覧を流し直さない", async () => {
    const harness = createHarness({ refreshSessions: () => Promise.resolve("kept") })

    await createSessionLaunch(harness.ports)(harness.receive, harness.receiveRestored, {
      selection: { by: "initial" },
      chat: undefined,
      resume: PREVIOUS_WORK,
    })
    await settle()

    expect(harness.driverEvents.filter((event) => event.kind === "sessions-changed")).toHaveLength(
      1,
    )
  })

  it.each<
    [
      string,
      SessionLaunchRequest["resume"],
      Partial<SessionLaunchPorts<Pack>>,
      readonly SessionEvent["kind"][],
    ]
  >([
    ["続きから起こした", PREVIOUS_WORK, {}, ["utterance"]],
    ["新規で起こした", { by: "new" }, {}, []],
    [
      "履歴が読めなかった",
      PREVIOUS_WORK,
      { restoreEvents: () => Promise.reject(new Error("架空の読み取り失敗")) },
      [],
    ],
  ])(
    "駆動を起こす口に渡す restored は、%s代の流し終えた履歴で解ける",
    async (_, resume, overrides, kinds) => {
      let restored: Promise<readonly RestoredEvent[]> = Promise.resolve([])
      const harness = createHarness({
        ...overrides,
        startDriver: (_seed, _onEvent, given) => {
          restored = given
          return createStubDriver().driver
        },
      })

      await createSessionLaunch(harness.ports)(harness.receive, harness.receiveRestored, {
        selection: { by: "initial" },
        chat: undefined,
        resume,
      })

      expect((await restored).map(({ event }) => event.kind)).toEqual(kinds)
    },
  )

  it("復元は別の口（onRestoredEvents）へまとめて1回で流れ、駆動のイベントと区別できる", async () => {
    const harness = createHarness({
      restoreEvents: () =>
        Promise.resolve(
          knownRestored([
            { kind: "utterance", text: "架空のターンの本文その1" },
            { kind: "utterance", text: "架空のターンの本文その2" },
          ]),
        ),
    })

    await createSessionLaunch(harness.ports)(harness.receive, harness.receiveRestored, {
      selection: { by: "initial" },
      chat: undefined,
      resume: PREVIOUS_WORK,
    })
    await settle()

    // 起動そのものが流す `character-changed` / `chat-mode-changed` は onEvent 側だけに乗る。
    expect(harness.driverEvents.map((event) => event.kind)).toEqual([
      "character-changed",
      "items-changed",
      "chat-mode-changed",
      "session-default-changed",
      "sessions-changed",
    ])
    // restoreEvents が組み直した履歴は onRestoredEvents 側だけに、1回で乗る。
    expect(harness.restoredDeliveries.map((events) => events.map((event) => event.kind))).toEqual([
      ["utterance", "utterance"],
    ])
    // 両方を混ぜた時系列は今までどおり（画面の見え方・順序は変わらない）。
    expect(harness.events.map((event) => event.kind)).toEqual([
      "character-changed",
      "items-changed",
      "chat-mode-changed",
      "session-default-changed",
      "sessions-changed",
      "utterance",
      "utterance",
    ])
  })
})
