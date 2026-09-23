import { describe, expect, it } from "bun:test"

import { type CharacterSelection } from "../../../src/server/core/character-selection.ts"
import { type SessionDriver, type SessionStart } from "../../../src/server/core/session-driver.ts"
import {
  createSessionLaunch,
  type SessionLaunchPorts,
} from "../../../src/server/core/session-launch.ts"
import { UNAVAILABLE_CONTEXT_USAGE } from "../../../src/shared/context-usage.ts"
import { BUILTIN_SESSION_DEFAULT } from "../../../src/shared/session-default.ts"
import { type SessionEvent } from "../../../src/shared/session-event.ts"
import { characterChangedEvent, shownPortraits } from "../../fixture/character.ts"

// 疑似セッションもセリフも手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。
// 本物の claude は起こさない（駆動も見張りも下の偽物）。
type Pack = { readonly name: string }

const INITIAL: Pack = { name: "tsukumo-spirit" }
const SWITCHED: Pack = { name: "kagami" }

// 切り替え先の一覧（目印・最終更新時刻・見出し。見出しは作り物の文字列
// docs/coding-standards.md「会話内容の扱い」）。
const CHOICES = [
  { viewPort: 7328, sessionId: "other-session", lastModified: 2_000, heading: "架空の見出しその1" },
  {
    viewPort: 7327,
    sessionId: "prev-work-session",
    lastModified: 1_000,
    heading: "架空の見出しその2",
  },
] as const

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
      setModel: () => Promise.resolve(),
      setPermissionMode: () => Promise.resolve(),
      close: () => calls.push("close"),
    },
  }
}

type Harness = {
  readonly ports: SessionLaunchPorts<Pack>
  /** 駆動（と見張り）から新しく届いたイベントと、復元の再生の両方を時系列に混ぜたもの。 */
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
    characterEvent: (pack: Pack) =>
      characterChangedEvent(
        {
          pack: pack.name,
          name: pack.name,
          editable: false,
          ...shownPortraits({ default: `/character/${pack.name}.png` }),
        },
        [{ name: pack.name, label: pack.name }],
      ),
    watchTasks: () => ({ close: () => calls.push("watchTasks:close") }),
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
      "findResumeSession:tsukumo-spirit:work",
      "listSessions:tsukumo-spirit:work",
      "startDriver:tsukumo-spirit:work:prev-work-session",
      "restoreEvents:prev-work-session",
    ])
    expect(harness.events.map((event) => event.kind)).toEqual([
      "character-changed",
      "chat-mode-changed",
      "session-default-changed",
      "sessions-changed",
      "utterance",
    ])
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
      "readSessionDefault",
      "findResumeSession:tsukumo-spirit:chat",
      "listSessions:tsukumo-spirit:chat",
      "startDriver:tsukumo-spirit:chat:prev-chat-session",
      "restoreEvents:prev-chat-session",
    ])
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
    // `set-chat-mode` の起こし直しがここを通る。**同じパックを起こすのは「画面から選ばれた」
    // ことではない**ので、覚えた値（`~/.tsukumo/state.json`）は書き換わらない
    // （docs/design.md 13.6）。
    const harness = createHarness()

    await createSessionLaunch(harness.ports)(harness.receive, harness.receiveRestored, {
      selection: { by: "current" },
      chat: true,
      resume: { by: "latest" },
    })
    await settle()

    expect(harness.calls).toEqual([
      "choosePack:current",
      "readSessionDefault",
      "findResumeSession:tsukumo-spirit:chat",
      "listSessions:tsukumo-spirit:chat",
      "startDriver:tsukumo-spirit:chat:prev-chat-session",
      "restoreEvents:prev-chat-session",
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

    // **`findResumeSession` は呼ばない**（印から探すのではなく、選ばれたIDがそのまま続き）。
    expect(harness.calls).toEqual([
      "choosePack:current",
      "readSessionDefault",
      "listSessions:tsukumo-spirit:work",
      "startDriver:tsukumo-spirit:work:other-session",
      "restoreEvents:other-session",
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

  it("駆動を閉じると、駆動と同じ間だけ動く見張りも閉じる", async () => {
    const harness = createHarness()

    const driver = await createSessionLaunch(harness.ports)(
      harness.receive,
      harness.receiveRestored,
      {
        selection: { by: "initial" },
        chat: undefined,
        resume: { by: "latest" },
      },
    )
    driver.close()

    expect(harness.calls).toContain("watchTasks:close")
    expect(harness.stub.calls).toContain("close")
  })

  it("見張りが流すイベントは、駆動のイベントと同じ受け口へ流れる", async () => {
    const harness = createHarness({
      watchTasks: (onEvent) => {
        onEvent({ kind: "tasks-changed", tasks: { kind: "known", items: [] } })
        return { close: () => {} }
      },
    })

    await createSessionLaunch(harness.ports)(harness.receive, harness.receiveRestored, {
      selection: { by: "initial" },
      chat: undefined,
      resume: { by: "latest" },
    })
    await settle()

    expect(harness.events.map((event) => event.kind)).toContain("tasks-changed")
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
      "sessions-changed",
    ])
    // restoreEvents が組み直した履歴は onRestoredEvent 側だけに乗る。
    expect(harness.restoredEvents.map((event) => event.kind)).toEqual(["utterance"])
    // 両方を混ぜた時系列は今までどおり（画面の見え方・順序は変わらない）。
    expect(harness.events.map((event) => event.kind)).toEqual([
      "character-changed",
      "chat-mode-changed",
      "session-default-changed",
      "sessions-changed",
      "utterance",
    ])
  })
})
