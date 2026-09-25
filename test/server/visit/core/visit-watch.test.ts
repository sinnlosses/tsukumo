import { describe, expect, it } from "bun:test"

import { readFakeSession } from "../../../../src/server/session-driver/adapter/fake-driver.ts"
import { type VisitGuest } from "../../../../src/server/visit/core/visit-guest.ts"
import {
  type VisitScriptDraft,
  type VisitScriptOutcome,
  type VisitScriptSource,
} from "../../../../src/server/visit/core/visit-script-writer.ts"
import { VISIT_SCRIPT_TIMEOUT_MS } from "../../../../src/server/visit/core/visit-script.ts"
import { QUICK_VISIT_TIMING, VISIT_TIMING } from "../../../../src/server/visit/core/visit-timing.ts"
import { createVisitWatch } from "../../../../src/server/visit/core/visit-watch.ts"
import { type CharacterVisit, type VisitScript } from "../../../../src/shared/character-visit.ts"
import { type SessionEvent } from "../../../../src/shared/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../src/shared/session-state.ts"
import { characterChangedEvent } from "../../../fixture/character.ts"
import { createManualClock } from "../../../fixture/manual-clock.ts"

// 依頼・セリフ・台本はすべて手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。
const SCRIPT: VisitScript = [
  { speaker: "guest", expression: "curious", text: "架空の客の一言目" },
  { speaker: "host", expression: "proud", text: "架空のあるじの返事" },
  { speaker: "guest", expression: "bored", text: "架空の客の二言目" },
]

const GUEST_VISIT: CharacterVisit = {
  peek: undefined,
  farewell: ["架空の帰りの一言"],
  scripts: [SCRIPT],
}

const REQUEST: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
const TOOL_STARTED: SessionEvent = {
  kind: "tool-started",
  toolUseId: "fictional-tool-1",
  name: "Bash",
  input: { command: "fictional-long-command" },
  parentToolUseId: undefined,
}

/**
 * 見張りを1つ起こし、session-manager と同じく「畳んでから見張りに渡す」を回す。見張りが出した
 * イベントも同じ道を通す。
 */
function startWatch(
  guests: readonly VisitGuest[] = [{ pack: "guest", visit: GUEST_VISIT }],
  host: "known" | "unknown" = "known",
  scriptSource: VisitScriptSource = { kind: "pack-only" },
) {
  const manual = createManualClock()
  let state: SessionState = INITIAL_SESSION_STATE
  const emitted: SessionEvent[] = []
  let listed = 0
  const feed = (event: SessionEvent): void => {
    state = applySessionEvent(state, event, manual.now())
    watch.observe(event, manual.now())
  }
  const watch = createVisitWatch({
    timing: VISIT_TIMING,
    clock: manual.clock,
    listGuests: () => {
      listed += 1
      return guests
    },
    random: () => 0,
    scriptSource,
    now: manual.now,
    readState: () => state,
    emit: (event) => {
      emitted.push(event)
      feed(event)
    },
  })
  if (host === "known") {
    feed(characterChangedEvent({}))
  }
  return {
    watch,
    feed,
    emitted,
    advance: manual.advance,
    pendingTimers: manual.pending,
    state: () => state,
    listed: () => listed,
  }
}

describe("createVisitWatch", () => {
  it("待ちがしきい値に届くと客が来て、間ごとに行が進み、言い終えたら帰る", () => {
    const run = startWatch()
    run.feed(REQUEST)
    run.feed(TOOL_STARTED)

    run.advance(VISIT_TIMING.waitMs - 1)
    expect(run.emitted).toEqual([])

    run.advance(1)
    expect(run.emitted).toEqual([
      { kind: "visit-started", guest: "guest", script: SCRIPT, farewell: "架空の帰りの一言" },
    ])

    run.advance(VISIT_TIMING.lineIntervalMs * 3)
    expect(run.emitted.slice(1)).toEqual([
      { kind: "visit-line-advanced", line: 1 },
      { kind: "visit-line-advanced", line: 2 },
      { kind: "visit-ended", reason: "script-finished" },
    ])
    expect(run.state().visit.kind).toBe("left")
  })

  it("訪問中に帰る合図が来たらその場で帰り、行はもう進まない", () => {
    const run = startWatch()
    run.feed(REQUEST)
    run.feed(TOOL_STARTED)
    run.advance(VISIT_TIMING.waitMs)

    run.feed({ kind: "speech", text: "架空のセリフ", expression: "proud" })
    run.advance(VISIT_TIMING.lineIntervalMs * 10)

    expect(run.emitted.map((event) => event.kind)).toEqual(["visit-started", "visit-ended"])
    expect(run.emitted[1]).toEqual({ kind: "visit-ended", reason: "speech" })
  })

  it("同じ待ちのあいだは、帰ったあとも二度は来ない", () => {
    const run = startWatch()
    run.feed(REQUEST)
    run.feed(TOOL_STARTED)
    run.advance(VISIT_TIMING.waitMs + VISIT_TIMING.lineIntervalMs * 3)

    run.advance(VISIT_TIMING.cooldownMs * 2)

    expect(run.emitted.filter((event) => event.kind === "visit-started")).toHaveLength(1)
  })

  it("あるじのほかに客が居なければ来ず、同じ待ちのあいだは一覧を読み直さない", () => {
    const run = startWatch([])
    run.feed(REQUEST)
    run.feed(TOOL_STARTED)
    run.advance(VISIT_TIMING.waitMs)
    run.feed({
      ...TOOL_STARTED,
      toolUseId: "fictional-nested",
      parentToolUseId: "fictional-tool-1",
    })
    run.advance(VISIT_TIMING.waitMs)

    expect(run.emitted).toEqual([])
    expect(run.listed()).toBe(1)
  })

  it("あるじのパックがまだ分からないうちは来ない", () => {
    const run = startWatch(undefined, "unknown")
    run.feed(REQUEST)
    run.feed(TOOL_STARTED)
    run.advance(VISIT_TIMING.waitMs * 2)

    expect(run.emitted).toEqual([])
  })

  it("閉じたら掛けていた時計を外す", () => {
    const run = startWatch()
    run.feed(REQUEST)
    run.feed(TOOL_STARTED)
    expect(run.pendingTimers()).toBe(1)

    run.watch.close()

    expect(run.pendingTimers()).toBe(0)
    run.advance(VISIT_TIMING.waitMs)
    expect(run.emitted).toEqual([])
  })
})

describe("createVisitWatch（台本をその場で作る）", () => {
  const WRITTEN: VisitScript = [
    { speaker: "guest", expression: "excited", text: "架空の作られた一言目" },
    { speaker: "host", expression: "thinking", text: "架空の作られた返事" },
    { speaker: "guest", expression: "curious", text: "架空の作られた二言目" },
  ]

  /** 呼ばれた注文と中断の合図を覚え、返す結果をテストが後から決める作る口。 */
  function createStubWriter() {
    const calls: { readonly draft: VisitScriptDraft; readonly signal: AbortSignal }[] = []
    let resolveLast: (outcome: VisitScriptOutcome) => void = () => {}
    const source: VisitScriptSource = {
      kind: "write",
      write: (draft, signal) => {
        calls.push({ draft, signal })
        return new Promise((resolve) => {
          resolveLast = resolve
        })
      },
    }
    return {
      source,
      calls,
      resolve: async (outcome: VisitScriptOutcome) => {
        resolveLast(outcome)
        await settle()
      },
    }
  }

  /** 作る口の結果が見張りに届くまで待つ。 */
  async function settle(): Promise<void> {
    await new Promise((resolve) => {
      setImmediate(resolve)
    })
  }

  function startWriting(
    writer: ReturnType<typeof createStubWriter>,
    guests?: readonly VisitGuest[],
  ) {
    const run = startWatch(guests, "known", writer.source)
    run.feed(REQUEST)
    run.feed({ kind: "speech", text: "架空の前のセリフ", expression: "proud" })
    run.feed(TOOL_STARTED)
    run.advance(VISIT_TIMING.waitMs)
    return run
  }

  it("しきい値に届くと作り始め、作れた台本で来る。注文には仕事の抜き書きと待った長さが載る", async () => {
    const writer = createStubWriter()
    const run = startWriting(writer)

    expect(run.emitted).toEqual([])
    expect(writer.calls).toHaveLength(1)
    expect(writer.calls[0]?.draft).toEqual({
      host: "fictional",
      guest: "guest",
      excerpt: {
        request: "架空の依頼",
        speeches: ["架空の前のセリフ"],
        waitingOn: ["Bash: fictional-long-command"],
      },
      waitedMs: VISIT_TIMING.waitMs,
    })

    await writer.resolve({ kind: "written", script: WRITTEN })

    expect(run.emitted).toEqual([
      { kind: "visit-started", guest: "guest", script: WRITTEN, farewell: "架空の帰りの一言" },
    ])
  })

  it("作れなかったらパックの台本で来る", async () => {
    const writer = createStubWriter()
    const run = startWriting(writer)

    await writer.resolve({ kind: "failed" })

    expect(run.emitted).toEqual([
      { kind: "visit-started", guest: "guest", script: SCRIPT, farewell: "架空の帰りの一言" },
    ])
  })

  it("時間切れなら中断してパックの台本で来る", async () => {
    const writer = createStubWriter()
    const run = startWriting(writer)

    run.advance(VISIT_SCRIPT_TIMEOUT_MS)
    expect(writer.calls[0]?.signal.aborted).toBe(true)
    // 中断を受けた作る口は failed で返る（`createVisitScriptWriter` の約束）。
    await writer.resolve({ kind: "failed" })

    expect(run.emitted.map((event) => event.kind)).toEqual(["visit-started"])
    expect(run.emitted[0]).toMatchObject({ script: SCRIPT })
  })

  it("作れず、パックにも台本が無ければ来ず、同じ待ちのあいだは作り直さない", async () => {
    const writer = createStubWriter()
    const run = startWriting(writer, [{ pack: "guest", visit: { ...GUEST_VISIT, scripts: [] } }])

    await writer.resolve({ kind: "failed" })
    run.advance(VISIT_TIMING.waitMs * 2)

    expect(run.emitted).toEqual([])
    expect(writer.calls).toHaveLength(1)
  })

  it("作っている最中に帰る合図が来たら中断し、あとから台本が届いても来ない", async () => {
    const writer = createStubWriter()
    const run = startWriting(writer)

    run.feed({ kind: "speech", text: "架空の新しいセリフ", expression: "proud" })
    expect(writer.calls[0]?.signal.aborted).toBe(true)
    await writer.resolve({ kind: "written", script: WRITTEN })
    run.advance(VISIT_SCRIPT_TIMEOUT_MS)

    expect(run.emitted).toEqual([])
    expect(run.pendingTimers()).toBe(0)
  })

  it("作っている最中に待ちが終わっても中断する", async () => {
    const writer = createStubWriter()
    const run = startWriting(writer)

    run.feed({
      kind: "tool-finished",
      toolUseId: "fictional-tool-1",
      content: "架空の出力",
      isError: false,
    })
    await writer.resolve({ kind: "written", script: WRITTEN })

    expect(writer.calls[0]?.signal.aborted).toBe(true)
    expect(run.emitted).toEqual([])
  })

  it("閉じたら作っている最中の台本も中断する", async () => {
    const writer = createStubWriter()
    const run = startWriting(writer)

    run.watch.close()
    await writer.resolve({ kind: "written", script: WRITTEN })

    expect(writer.calls[0]?.signal.aborted).toBe(true)
    expect(run.emitted).toEqual([])
    expect(run.pendingTimers()).toBe(0)
  })
})

describe("疑似セッションの訪問の場面", () => {
  /**
   * 疑似セッション（`test/fixture/fake-session.json`）の場面を、縮めたしきい値
   * （`TSUKUMO_VISIT_QUICK=1` と同じ表）で見張りに流し、見張りが出したイベントを返す。
   */
  function playScene(name: string): readonly SessionEvent[] {
    const scene = readFakeSession()?.turns.find((candidate) => candidate.name === name)
    if (scene === undefined) {
      throw new Error(`疑似セッションに場面 ${name} が無い`)
    }
    const manual = createManualClock()
    let state: SessionState = INITIAL_SESSION_STATE
    const emitted: SessionEvent[] = []
    const feed = (event: SessionEvent): void => {
      state = applySessionEvent(state, event, manual.now())
      watch.observe(event, manual.now())
    }
    const watch = createVisitWatch({
      timing: QUICK_VISIT_TIMING,
      clock: manual.clock,
      listGuests: () => [{ pack: "guest", visit: GUEST_VISIT }],
      random: () => 0,
      scriptSource: { kind: "pack-only" },
      now: manual.now,
      readState: () => state,
      emit: (event) => {
        emitted.push(event)
        feed(event)
      },
    })
    feed(characterChangedEvent({}))
    for (const step of scene.steps) {
      manual.clock.after(step.afterMs, () => {
        feed(step.event)
      })
    }
    manual.advance(Math.max(...scene.steps.map((step) => step.afterMs)))
    return emitted
  }

  it("visit-long-tool: ツールが走っているあいだに来て、台本を言い終えて帰る", () => {
    const emitted = playScene("visit-long-tool")

    expect(emitted[0]?.kind).toBe("visit-started")
    expect(emitted.at(-1)).toEqual({ kind: "visit-ended", reason: "script-finished" })
    expect(emitted.filter((event) => event.kind === "visit-started")).toHaveLength(1)
  })

  it("visit-background: 背景の待ちのあいだに来て、待ちが終わると台本の途中でも帰る", () => {
    const emitted = playScene("visit-background")

    expect(emitted[0]?.kind).toBe("visit-started")
    expect(emitted.at(-1)).toEqual({ kind: "visit-ended", reason: "wait-over" })
    expect(emitted.filter((event) => event.kind === "visit-line-advanced").length).toBeLessThan(
      SCRIPT.length - 1,
    )
  })
})
