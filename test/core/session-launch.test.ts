import { describe, expect, it } from "bun:test"

import { type SessionDriver } from "../../src/core/session-driver.ts"
import { createSessionLaunch, type SessionLaunchPorts } from "../../src/core/session-launch.ts"
import { type SessionEvent } from "../../src/protocol/session-event.ts"

// 台本もセリフも手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。
// 本物の claude は起こさない（駆動も見張りも下の偽物）。
type Pack = { readonly name: string }

const INITIAL: Pack = { name: "tsukumo-spirit" }
const SWITCHED: Pack = { name: "kagami" }

/** 起こされたことと閉じられたことだけを覚える偽の駆動。 */
function createStubDriver(): { readonly driver: SessionDriver; readonly calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    driver: {
      prompt: (text: string) => calls.push(`prompt:${text}`),
      interrupt: () => Promise.resolve(),
      answer: () => true,
      pending: () => [],
      setModel: () => Promise.resolve(),
      setPermissionMode: () => Promise.resolve(),
      close: () => calls.push("close"),
    },
  }
}

function characterEventOf(pack: Pack): SessionEvent {
  return {
    kind: "character-changed",
    pack: pack.name,
    name: pack.name,
    accent: undefined,
    speechMarker: undefined,
    editable: false,
    expressions: [{ name: "default", label: "通常" }],
    portraits: {
      default: `/character/${pack.name}.png`,
      thinking: undefined,
      proud: undefined,
      flustered: undefined,
    },
    outfitAccents: { default: undefined, light: undefined, normal: undefined, heavy: undefined },
    packs: [{ name: pack.name, label: pack.name }],
  }
}

type Harness = {
  readonly ports: SessionLaunchPorts<Pack>
  readonly events: SessionEvent[]
  readonly calls: string[]
  readonly stub: ReturnType<typeof createStubDriver>
  readonly receive: (event: SessionEvent) => void
}

function createHarness(overrides: Partial<SessionLaunchPorts<Pack>> = {}): Harness {
  const events: SessionEvent[] = []
  const calls: string[] = []
  const stub = createStubDriver()

  const ports: SessionLaunchPorts<Pack> = {
    choosePack: (character) => {
      calls.push(`choosePack:${character ?? ""}`)
      return character === undefined ? INITIAL : SWITCHED
    },
    rememberPack: (pack) => calls.push(`rememberPack:${pack.name}`),
    characterEvent: (pack) => characterEventOf(pack),
    watchTasks: () => ({ close: () => calls.push("watchTasks:close") }),
    findResumeSession: (pack) => {
      calls.push(`findResumeSession:${pack.name}`)
      return Promise.resolve("prev-session")
    },
    startDriver: (seed) => {
      calls.push(`startDriver:${seed.pack.name}:${seed.resume ?? ""}`)
      return stub.driver
    },
    restoreEvents: (sessionId) => {
      calls.push(`restoreEvents:${sessionId}`)
      return Promise.resolve([{ kind: "utterance", text: "架空のターンの本文" }])
    },
    ...overrides,
  }

  return { ports, events, calls, stub, receive: (event) => events.push(event) }
}

/** 投げっぱなしの再生（`void`）が流れ終わるのを待つ。 */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe("createSessionLaunch", () => {
  it("起動時は覚えた値のパックで起こし、続きから始まった印を流す", async () => {
    const harness = createHarness()

    const driver = await createSessionLaunch(harness.ports)(harness.receive, undefined)
    await settle()

    expect(driver).toBeDefined()
    expect(harness.calls).toEqual([
      "choosePack:",
      "findResumeSession:tsukumo-spirit",
      "startDriver:tsukumo-spirit:prev-session",
      "restoreEvents:prev-session",
    ])
    expect(harness.events.map((event) => event.kind)).toEqual([
      "character-changed",
      "session-restored",
      "utterance",
    ])
  })

  it("続きから始めるセッションが無ければ、印も履歴も流さない", async () => {
    const harness = createHarness({
      findResumeSession: () => Promise.resolve(undefined),
    })

    await createSessionLaunch(harness.ports)(harness.receive, undefined)
    await settle()

    expect(harness.calls.some((call) => call.startsWith("restoreEvents:"))).toBe(false)
    expect(harness.events.map((event) => event.kind)).toEqual(["character-changed"])
  })

  it("再生が失敗しても駆動は動き続ける", async () => {
    const harness = createHarness({
      restoreEvents: () => Promise.reject(new Error("架空の読み取り失敗")),
    })

    const driver = await createSessionLaunch(harness.ports)(harness.receive, undefined)
    await settle()
    driver.prompt("架空の依頼")

    expect(harness.events.map((event) => event.kind)).toEqual([
      "character-changed",
      "session-restored",
    ])
    expect(harness.stub.calls).toEqual(["prompt:架空の依頼"])
  })

  it("画面から選んで起こし直したときだけ、そのパックを覚える", async () => {
    const harness = createHarness()

    await createSessionLaunch(harness.ports)(harness.receive, "kagami")
    await settle()

    expect(harness.calls).toContain("rememberPack:kagami")
    expect(harness.calls).toContain("startDriver:kagami:prev-session")
  })

  it("起動時（画面から選んでいないとき）は覚えない", async () => {
    const harness = createHarness()

    await createSessionLaunch(harness.ports)(harness.receive, undefined)
    await settle()

    expect(harness.calls.some((call) => call.startsWith("rememberPack:"))).toBe(false)
  })

  it("駆動を閉じると、駆動と同じ間だけ動く見張りも閉じる", async () => {
    const harness = createHarness()

    const driver = await createSessionLaunch(harness.ports)(harness.receive, undefined)
    driver.close()

    expect(harness.calls).toContain("watchTasks:close")
    expect(harness.stub.calls).toContain("close")
  })

  it("見張りが流すイベントは、駆動のイベントと同じ受け口へ流れる", async () => {
    const harness = createHarness({
      watchTasks: (onEvent) => {
        onEvent({ kind: "tasks-changed", tasks: [] })
        return { close: () => {} }
      },
    })

    await createSessionLaunch(harness.ports)(harness.receive, undefined)
    await settle()

    expect(harness.events.map((event) => event.kind)).toContain("tasks-changed")
  })
})
