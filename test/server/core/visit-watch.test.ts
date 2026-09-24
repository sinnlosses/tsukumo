import { describe, expect, it } from "bun:test"

import { readFakeSession } from "../../../src/server/adapter/fake-driver.ts"
import { type VisitGuest } from "../../../src/server/core/visit-guest.ts"
import { QUICK_VISIT_TIMING, VISIT_TIMING } from "../../../src/server/core/visit-timing.ts"
import { createVisitWatch } from "../../../src/server/core/visit-watch.ts"
import { type CharacterVisit, type VisitScript } from "../../../src/shared/character-visit.ts"
import { type SessionEvent } from "../../../src/shared/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../src/shared/session-state.ts"
import { characterChangedEvent } from "../../fixture/character.ts"
import { createManualClock } from "../../fixture/manual-clock.ts"

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
