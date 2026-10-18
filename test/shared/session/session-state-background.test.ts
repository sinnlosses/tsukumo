import { describe, expect, it } from "vitest"

import type { BackgroundTask } from "../../../src/shared/session-driver/background-task.ts"
import { applyRestoredEvents } from "../../../src/shared/session/restored-event.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../src/shared/session/session-state.ts"
import { apply } from "../../fixture/session-state.ts"

describe("applySessionEvent（バックグラウンドタスク）", () => {
  const SHELL_TASK = {
    taskId: "bash-1",
    kind: "shell",
    description: "架空の待ち",
  } satisfies BackgroundTask

  it("session-ended で空にする（claude のプロセスと一緒に終わる）", () => {
    const view = apply(
      { kind: "background-tasks-changed", tasks: [SHELL_TASK] },
      { kind: "session-ended", reason: "セッションが終了した" },
    )

    expect(view.backgroundTasks).toEqual([])
  })
})

describe("applySessionEvent（背景で走らせた Bash の終わり）", () => {
  const bashStarted = (toolUseId: string, input: unknown): SessionEvent => ({
    kind: "tool-started",
    toolUseId,
    name: "Bash",
    input,
    parentToolUseId: undefined,
  })
  const accepted = (toolUseId: string): SessionEvent => ({
    kind: "tool-finished",
    toolUseId,
    content: "架空の受付",
    isError: false,
  })
  const notified = (toolUseId: string): SessionEvent => ({
    kind: "background-tool-finished",
    toolUseId,
  })
  const applyAt = (...stamped: readonly (readonly [SessionEvent, number])[]): SessionState =>
    stamped.reduce(
      (state, [event, at]) => applySessionEvent(state, event, at),
      INITIAL_SESSION_STATE,
    )
  const backgroundEndsOf = (state: SessionState) =>
    state.records.flatMap((record) => (record.kind === "tool" ? [record.backgroundEnd] : []))

  it("run_in_background の Bash は知らせを待ち、知らせが届いた時刻を持つ（tool_result の受付は終わりにしない）", () => {
    const waiting = applyAt(
      [bashStarted("toolu_bg", { command: "架空の検査", run_in_background: true }), 1_000],
      [accepted("toolu_bg"), 1_300],
    )
    const done = applySessionEvent(waiting, notified("toolu_bg"), 9_000)

    expect(backgroundEndsOf(waiting)).toEqual([{ kind: "awaiting" }])
    expect(backgroundEndsOf(done)).toEqual([
      { kind: "notified", at: { kind: "stamped", at: 9_000 } },
    ])
  })

  it("前景の Bash・知らない id・2回目の知らせでは姿を変えない（前景でも長いと知らせが届く）", () => {
    const state = applyAt(
      [bashStarted("toolu_fg", { command: "架空の検査" }), 0],
      [notified("toolu_fg"), 4_000],
      [accepted("toolu_fg"), 4_005],
      [bashStarted("toolu_bg", { command: "架空の検査", run_in_background: true }), 5_000],
      [notified("toolu_bg"), 7_000],
      [notified("toolu_bg"), 8_000],
      [notified("toolu_unknown"), 9_000],
    )

    expect(backgroundEndsOf(state)).toEqual([
      { kind: "foreground" },
      { kind: "notified", at: { kind: "stamped", at: 7_000 } },
    ])
  })

  it("復元した記録の知らせは、読めた時刻の recovered になり、読めなければ restored になる", () => {
    const start = bashStarted("toolu_bg", { command: "架空の検査", run_in_background: true })
    const withTime = applyRestoredEvents(
      INITIAL_SESSION_STATE,
      [
        { event: start, time: { kind: "known", at: 0 } },
        { event: notified("toolu_bg"), time: { kind: "known", at: 7_000 } },
      ],
      8_000,
    )
    const withoutTime = applyRestoredEvents(
      INITIAL_SESSION_STATE,
      [
        { event: start, time: { kind: "known", at: 0 } },
        { event: notified("toolu_bg"), time: { kind: "unknown" } },
      ],
      8_000,
    )

    expect(backgroundEndsOf(withTime)).toEqual([
      { kind: "notified", at: { kind: "recovered", at: 7_000 } },
    ])
    expect(backgroundEndsOf(withoutTime)).toEqual([{ kind: "notified", at: { kind: "restored" } }])
  })
})
