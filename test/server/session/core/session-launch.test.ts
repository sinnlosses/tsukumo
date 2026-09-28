import { describe, expect, it } from "vitest"

import type { CharacterSelection } from "../../../../src/server/character-pack/core/character-selection.ts"
import { createSessionCatalog } from "../../../../src/server/session-driver/core/session-catalog.ts"
import type {
  SessionDriver,
  SessionStart,
} from "../../../../src/server/session-driver/core/session-driver.ts"
import { sessionTag } from "../../../../src/server/session-driver/core/session-restore.ts"
import {
  createSessionLaunch,
  type SessionLaunchPorts,
} from "../../../../src/server/session/core/session-launch.ts"
import { UNAVAILABLE_CONTEXT_USAGE } from "../../../../src/shared/context-usage/context-usage.ts"
import { UNAVAILABLE_PLAN_USAGE } from "../../../../src/shared/plan-usage/plan-usage.ts"
import { BUILTIN_SESSION_DEFAULT } from "../../../../src/shared/session/session-default.ts"
import { UNAVAILABLE_SESSION_DIGEST } from "../../../../src/shared/session/session-digest.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { DEFAULT_VISIT_ENABLED } from "../../../../src/shared/visit/visit.ts"
import {
  characterChangedEvent,
  characterPackEntry,
  shownPortraits,
} from "../../../fixture/character.ts"

// 本物の claude は起こさない（駆動は下の偽物）。
type Pack = { readonly name: string }

const INITIAL: Pack = { name: "tsukumo-spirit" }
const SWITCHED: Pack = { name: "kagami" }

// 切り替え先の一覧（目印・最終更新時刻・見出し）。
const CHOICES = [
  {
    viewPort: 7328,
    sessionId: "other-session",
    lastModified: 2_000,
    startedAt: 1_500,
    heading: "架空の見出しその1",
  },
  {
    viewPort: 7327,
    sessionId: "prev-work-session",
    lastModified: 1_000,
    startedAt: 500,
    heading: "架空の見出しその2",
  },
] as const

const CHAT_TOPICS = ["架空の話題その1", "架空の話題その2"] as const

const REMEMBERED_LINES = ["架空の覚えたことその1"] as const

/** 起こされたことと閉じられたことだけを覚える fake driver 相当のスタブ。 */
function createStubDriver(): { readonly driver: SessionDriver; readonly calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    driver: {
      prompt: (text: string) => calls.push(`prompt:${text}`),
      promptWithoutRecord: (text: string) => calls.push(`promptWithoutRecord:${text}`),
      interrupt: () => Promise.resolve(),
      answer: () => true,
      pending: () => [],
      readContextUsage: () => Promise.resolve(UNAVAILABLE_CONTEXT_USAGE),
      readPlanUsage: () => Promise.resolve(UNAVAILABLE_PLAN_USAGE),
      readSessionDigest: () => Promise.resolve(UNAVAILABLE_SESSION_DIGEST),
      setModel: () => Promise.resolve(),
      setEffort: () => Promise.resolve(),
      setPermissionMode: () => Promise.resolve(),
      close: () => calls.push("close"),
    },
  }
}

type Harness = {
  readonly ports: SessionLaunchPorts<Pack>
  /** 駆動から新しく届いたイベントと、復元の再生の両方を時系列に混ぜたもの。 */
  readonly events: SessionEvent[]
  /** `onEvent` を通ったイベントだけ（復元の再生は入らない）。 */
  readonly driverEvents: SessionEvent[]
  /** `onRestoredEvent` を通ったイベントだけ（駆動から新しく届いたものは入らない）。 */
  readonly restoredEvents: SessionEvent[]
  readonly calls: string[]
  readonly stub: ReturnType<typeof createStubDriver>
  readonly receive: (event: SessionEvent) => void
  readonly receiveRestored: (event: SessionEvent) => void
}

function createHarness(overrides: Partial<SessionLaunchPorts<Pack>> = {}): Harness {
  const events: SessionEvent[] = []
  const driverEvents: SessionEvent[] = []
  const restoredEvents: SessionEvent[] = []
  const calls: string[] = []
  const stub = createStubDriver()

  const ports: SessionLaunchPorts<Pack> = {
    choosePack: (selection) => {
      calls.push(`choosePack:${labelOf(selection)}`)
      return selection.by === "name" ? SWITCHED : INITIAL
    },
    rememberPack: (pack) => calls.push(`rememberPack:${pack.name}`),
    readSessionDefault: () => {
      calls.push("readSessionDefault")
      return BUILTIN_SESSION_DEFAULT
    },
    readVisitEnabled: () => {
      calls.push("readVisitEnabled")
      return DEFAULT_VISIT_ENABLED
    },
    characterEvent: (pack: Pack) =>
      characterChangedEvent(
        {
          pack: pack.name,
          name: pack.name,
          editable: false,
          ...shownPortraits({ default: `/character/${pack.name}.png` }),
        },
        [characterPackEntry(pack.name, pack.name, { inUse: true })],
      ),
    readChatTopics: (pack) => {
      calls.push(`readChatTopics:${pack.name}`)
      return CHAT_TOPICS
    },
    readRememberedLines: (pack) => {
      calls.push(`readRememberedLines:${pack.name}`)
      return REMEMBERED_LINES
    },
    findResumeSession: (pack, chat) => {
      calls.push(`findResumeSession:${pack.name}:${modeOf(chat)}`)
      const sessionId = `prev-${modeOf(chat)}-session`
      return Promise.resolve({ kind: "resume", sessionId })
    },
    listSessions: (pack, chat) => {
      calls.push(`listSessions:${pack.name}:${modeOf(chat)}`)
      return Promise.resolve(CHOICES)
    },
    startDriver: (seed) => {
      const resumeId = seed.start.kind === "resume" ? seed.start.sessionId : ""
      calls.push(`startDriver:${seed.pack.name}:${modeOf(seed.chat)}:${resumeId}`)
      return stub.driver
    },
    refreshSessions: () => {
      calls.push("refreshSessions")
      // 読み直しが終わらないまま（読み直したあとの一覧は、それを見るテストだけが差し替えて流す）。
      return new Promise(() => {})
    },
    restoreEvents: (sessionId) => {
      calls.push(`restoreEvents:${sessionId}`)
      return Promise.resolve([{ kind: "utterance", text: "架空のターンの本文" }])
    },
    ...overrides,
  }

  return {
    ports,
    events,
    driverEvents,
    restoredEvents,
    calls,
    stub,
    receive: (event) => {
      events.push(event)
      driverEvents.push(event)
    },
    receiveRestored: (event) => {
      events.push(event)
      restoredEvents.push(event)
    },
  }
}

/** 呼ばれ方の記録に混ぜる、そのときのパックの決め方。 */
function labelOf(selection: CharacterSelection): string {
  return selection.by === "name" ? `name:${selection.name}` : selection.by
}

/** 呼ばれ方の記録に混ぜる、そのときのモード。 */
function modeOf(chat: boolean): string {
  return chat ? "chat" : "work"
}

/** 投げっぱなしの再生（`void`）が流れ終わるのを待つ。 */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe("createSessionLaunch", () => {
  it("起動時は覚えた値のパックで起こし、続きの履歴を流す", async () => {
    const harness = createHarness()

    await createSessionLaunch(harness.ports)(harness.receive, harness.receiveRestored, {
      selection: { by: "initial" },
      chat: undefined,
      resume: { by: "latest" },
    })
    await settle()

    expect(harness.calls).toEqual([
      "choosePack:initial",
      "readSessionDefault",
      "readVisitEnabled",
      "findResumeSession:tsukumo-spirit:work",
      "listSessions:tsukumo-spirit:work",
      "startDriver:tsukumo-spirit:work:prev-work-session",
      "restoreEvents:prev-work-session",
      "refreshSessions",
    ])
    expect(harness.events.map((event) => event.kind)).toEqual([
      "character-changed",
      "chat-mode-changed",
      "session-default-changed",
      "visit-enabled-changed",
      "sessions-changed",
      "utterance",
    ])
  })

  it("駆動を返す前に、続きの履歴を流し終えている", async () => {
    // 読み終わるのがタイマーの後になる再生。待たずに返すと、返った時点ではまだ流れていない。
    const harness = createHarness({
      restoreEvents: () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve([{ kind: "utterance", text: "架空のターンの本文" }])
          }, 0)
        }),
    })

    await createSessionLaunch(harness.ports)(harness.receive, harness.receiveRestored, {
      selection: { by: "current" },
      chat: true,
      resume: { by: "latest" },
    })

    // 起こし直しの `hello` はここで配られる（session-manager の restart）ので、履歴が
    // 入っていないと画面は既定の表情で描いたあとに続きの表情へもう一度飛ぶ。
    expect(harness.restoredEvents.map((event) => event.kind)).toEqual(["utterance"])
  })

  it("続きから始めるセッションが無ければ、履歴を流さない", async () => {
    const harness = createHarness({
      findResumeSession: (): Promise<SessionStart> => Promise.resolve({ kind: "new" }),
    })

    await createSessionLaunch(harness.ports)(harness.receive, harness.receiveRestored, {
      selection: { by: "initial" },
      chat: undefined,
      resume: { by: "latest" },
    })
    await settle()

    expect(harness.calls.some((call) => call.startsWith("restoreEvents:"))).toBe(false)
    expect(harness.events.map((event) => event.kind)).toEqual([
      "character-changed",
      "chat-mode-changed",
      "session-default-changed",
      "visit-enabled-changed",
      "sessions-changed",
    ])
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
        resume: { by: "latest" },
      },
    )
    await settle()
    driver.prompt("架空の依頼", [])

    expect(harness.events.map((event) => event.kind)).toEqual([
      "character-changed",
      "chat-mode-changed",
      "session-default-changed",
      "visit-enabled-changed",
      "sessions-changed",
    ])
    expect(harness.stub.calls).toEqual(["prompt:架空の依頼"])
  })

  it("画面から選んで起こし直したときだけ、そのパックを覚える", async () => {
    const harness = createHarness()

    await createSessionLaunch(harness.ports)(harness.receive, harness.receiveRestored, {
      selection: { by: "name", name: "kagami" },
      chat: undefined,
      resume: { by: "latest" },
    })
    await settle()

    expect(harness.calls).toContain("rememberPack:kagami")
    expect(harness.calls).toContain("startDriver:kagami:work:prev-work-session")
  })

  it("雑談で起こすと、雑談の側の続きを探して雑談の駆動を起こす（仕事の続きを拾わない）", async () => {
    const harness = createHarness()

    await createSessionLaunch(harness.ports)(harness.receive, harness.receiveRestored, {
      selection: { by: "initial" },
      chat: true,
      resume: { by: "latest" },
    })
    await settle()

    expect(harness.calls).toEqual([
      "choosePack:initial",
      "readChatTopics:tsukumo-spirit",
      "readRememberedLines:tsukumo-spirit",
      "readSessionDefault",
      "readVisitEnabled",
      "findResumeSession:tsukumo-spirit:chat",
      "listSessions:tsukumo-spirit:chat",
      "startDriver:tsukumo-spirit:chat:prev-chat-session",
      "restoreEvents:prev-chat-session",
      "refreshSessions",
    ])
  })

  it("雑談で起こすと、写しから取り出した最近の話題を chat-mode-changed のあとに流す", async () => {
    const harness = createHarness()

    await createSessionLaunch(harness.ports)(harness.receive, harness.receiveRestored, {
      selection: { by: "initial" },
      chat: true,
      resume: { by: "latest" },
    })
    await settle()

    const kinds = harness.driverEvents.map((event) => event.kind)
    expect(kinds.indexOf("chat-topics-changed")).toBe(kinds.indexOf("chat-mode-changed") + 1)
    expect(harness.driverEvents).toContainEqual({
      kind: "chat-topics-changed",
      topics: CHAT_TOPICS,
    })
  })

  it("雑談で起こすと、覚えたことの一覧を chat-topics-changed のあとに流す", async () => {
    const harness = createHarness()

    await createSessionLaunch(harness.ports)(harness.receive, harness.receiveRestored, {
      selection: { by: "initial" },
      chat: true,
      resume: { by: "latest" },
    })
    await settle()

    const kinds = harness.driverEvents.map((event) => event.kind)
    expect(kinds.indexOf("remembered-lines-changed")).toBe(kinds.indexOf("chat-topics-changed") + 1)
    expect(harness.driverEvents).toContainEqual({
      kind: "remembered-lines-changed",
      lines: REMEMBERED_LINES,
    })
  })

  it("仕事で起こすときは写しを読まず、最近の話題も覚えたことも流さない", async () => {
    const harness = createHarness()

    await createSessionLaunch(harness.ports)(harness.receive, harness.receiveRestored, {
      selection: { by: "initial" },
      chat: false,
      resume: { by: "latest" },
    })
    await settle()

    expect(harness.calls.some((call) => call.startsWith("readChatTopics:"))).toBe(false)
    expect(harness.calls.some((call) => call.startsWith("readRememberedLines:"))).toBe(false)
    expect(harness.events.some((event) => event.kind === "chat-topics-changed")).toBe(false)
    expect(harness.events.some((event) => event.kind === "remembered-lines-changed")).toBe(false)
  })

  it("起動時（画面から選んでいないとき）は覚えない", async () => {
    const harness = createHarness()

    await createSessionLaunch(harness.ports)(harness.receive, harness.receiveRestored, {
      selection: { by: "initial" },
      chat: undefined,
      resume: { by: "latest" },
    })
    await settle()

    expect(harness.calls.some((call) => call.startsWith("rememberPack:"))).toBe(false)
  })

  it("いま出しているパックのまま起こし直す（モードの切り替え）ときは覚えない", async () => {
    // `session.setChatMode` の起こし直しがここを通る。同じパックを起こすのは「画面から選ばれた」
    // ことではないので、覚えた値（`~/.tsukumo/state.json`）は書き換わらない
    // （docs/architecture/screen-design.md「設定の置き場所」）。
    const harness = createHarness()

    await createSessionLaunch(harness.ports)(harness.receive, harness.receiveRestored, {
      selection: { by: "current" },
      chat: true,
      resume: { by: "latest" },
    })
    await settle()

    expect(harness.calls).toEqual([
      "choosePack:current",
      "readChatTopics:tsukumo-spirit",
      "readRememberedLines:tsukumo-spirit",
      "readSessionDefault",
      "readVisitEnabled",
      "findResumeSession:tsukumo-spirit:chat",
      "listSessions:tsukumo-spirit:chat",
      "startDriver:tsukumo-spirit:chat:prev-chat-session",
      "restoreEvents:prev-chat-session",
      "refreshSessions",
    ])
    expect(harness.calls.some((call) => call.startsWith("rememberPack:"))).toBe(false)
  })

  it("画面から選んだセッションは探さずに、そのIDの続きから起こす", async () => {
    const harness = createHarness()

    await createSessionLaunch(harness.ports)(harness.receive, harness.receiveRestored, {
      selection: { by: "current" },
      chat: undefined,
      resume: { by: "id", sessionId: "other-session" },
    })
    await settle()

    // `findResumeSession` は呼ばない（印から探すのではなく、選ばれたIDがそのまま続き）。
    expect(harness.calls).toEqual([
      "choosePack:current",
      "readSessionDefault",
      "readVisitEnabled",
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

  it("切り替え先の一覧を、起こすたびに画面へ流す", async () => {
    const harness = createHarness()

    await createSessionLaunch(harness.ports)(harness.receive, harness.receiveRestored, {
      selection: { by: "initial" },
      chat: undefined,
      resume: { by: "latest" },
    })
    await settle()

    // いま起こしたセッション（`current`）も一緒に流れるので、画面は最初の依頼を待たずに
    // 居場所を指せる。
    expect(harness.driverEvents).toContainEqual({
      kind: "sessions-changed",
      sessions: CHOICES,
      current: "prev-work-session",
    })
  })

  it("起こし直しは transcript の一覧を読まずに続きを選び、読み直しを待たずに駆動を返す", async () => {
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
                tag: sessionTag("tsukumo-spirit", false, 7327),
              },
              {
                sessionId: "s-chat",
                lastModified: 100,
                tag: sessionTag("tsukumo-spirit", true, 7327),
              },
            ])
          : new Promise(() => {})
      },
      now: () => 1_000,
    })
    const harness = createHarness({
      findResumeSession: async (pack, chat) => {
        const sessionId = await catalog.findToResume(sessionTag(pack.name, chat, 7327))
        return sessionId === undefined ? { kind: "new" } : { kind: "resume", sessionId }
      },
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
      resume: { by: "latest" },
    })
    calls.length = 0

    await launch(harness.receive, harness.receiveRestored, {
      selection: { by: "current" },
      chat: true,
      resume: { by: "latest" },
    })
    await launch(harness.receive, harness.receiveRestored, {
      selection: { by: "current" },
      chat: false,
      resume: { by: "latest" },
    })

    // 読むのは駆動を起こしたあとの読み直しだけで、どちらの起こし直しもそれを待たずに返っている。
    expect(calls).toEqual(["startDriver:chat:s-chat", "read", "startDriver:work:s-work", "read"])
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
      resume: { by: "latest" },
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
      resume: { by: "latest" },
    })
    await settle()

    expect(harness.driverEvents.filter((event) => event.kind === "sessions-changed")).toHaveLength(
      1,
    )
  })

  it("復元は別の口（onRestoredEvent）へ流れ、駆動のイベントと区別できる", async () => {
    const harness = createHarness()

    await createSessionLaunch(harness.ports)(harness.receive, harness.receiveRestored, {
      selection: { by: "initial" },
      chat: undefined,
      resume: { by: "latest" },
    })
    await settle()

    // 起動そのものが流す `character-changed` / `chat-mode-changed` は onEvent 側だけに乗る。
    expect(harness.driverEvents.map((event) => event.kind)).toEqual([
      "character-changed",
      "chat-mode-changed",
      "session-default-changed",
      "visit-enabled-changed",
      "sessions-changed",
    ])
    // restoreEvents が組み直した履歴は onRestoredEvent 側だけに乗る。
    expect(harness.restoredEvents.map((event) => event.kind)).toEqual(["utterance"])
    // 両方を混ぜた時系列は今までどおり（画面の見え方・順序は変わらない）。
    expect(harness.events.map((event) => event.kind)).toEqual([
      "character-changed",
      "chat-mode-changed",
      "session-default-changed",
      "visit-enabled-changed",
      "sessions-changed",
      "utterance",
    ])
  })

  // 歯車の「訪問」のオン・オフ（`docs/architecture/screen-design.md`「設定の置き場所」）。覚え方は「新しいセッションの既定」
  // と同じで、読むのも起こすたびに1回（`readSessionDefault` と同じ理由）。
  it("覚えた visitEnabled を、起こした初期値として visit-enabled-changed で流す", async () => {
    const harness = createHarness({ readVisitEnabled: () => false })

    await createSessionLaunch(harness.ports)(harness.receive, harness.receiveRestored, {
      selection: { by: "initial" },
      chat: undefined,
      resume: { by: "latest" },
    })
    await settle()

    expect(harness.driverEvents).toContainEqual({
      kind: "visit-enabled-changed",
      visitEnabled: false,
    })
  })
})
