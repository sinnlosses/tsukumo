import { describe, expect, it } from "vitest"

import { applyRestoredEvents } from "../../../src/server/session/core/event/restored-event.ts"
import type { BackgroundTask } from "../../../src/shared/session-driver/background-task.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../src/shared/session/session-state.ts"
import { apply } from "../../fixture/session-state.ts"
import { checkedTaskId } from "../../fixture/task-id.ts"
import { checkedToolUseId } from "../../fixture/tool-use-id.ts"

describe("applySessionEvent（バックグラウンドタスク）", () => {
  const SHELL_TASK = {
    taskId: checkedTaskId("bash-1"),
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

describe("applySessionEvent（任せた役の進みの1行）", () => {
  const AGENT = {
    taskId: checkedTaskId("agent-1"),
    kind: "agent",
    description: "架空の実装役",
  } satisfies BackgroundTask
  const WORKFLOW = {
    taskId: checkedTaskId("workflow-1"),
    kind: "workflow",
    description: "架空の流れ",
  } satisfies BackgroundTask
  const SHELL = {
    taskId: checkedTaskId("bash-1"),
    kind: "shell",
    description: "架空の待ち",
  } satisfies BackgroundTask
  const tasks = (...members: readonly BackgroundTask[]): SessionEvent => ({
    kind: "background-tasks-changed",
    tasks: members,
  })
  const progress = (task: BackgroundTask, summary: string): SessionEvent => ({
    kind: "delegate-progress",
    taskId: task.taskId,
    summary,
  })
  const applyAt = (...stamped: readonly (readonly [SessionEvent, number])[]): SessionState =>
    stamped.reduce(
      (state, [event, at]) => applySessionEvent(state, event, at),
      INITIAL_SESSION_STATE,
    )
  const shapeOf = (state: SessionState) =>
    state.delegateRoles.map((role) => [role.taskId, role.name, role.state, role.summary])

  it("顔ぶれの agent・workflow だけが役になり、同じ役の2通目が1通目を置き換える", () => {
    const state = applyAt(
      [tasks(AGENT, WORKFLOW, SHELL), 1_000],
      [progress(AGENT, "架空の1通目"), 2_000],
      [progress(AGENT, "架空の2通目"), 3_000],
    )

    expect(shapeOf(state)).toEqual([
      [AGENT.taskId, "架空の実装役", "running", "架空の2通目"],
      [WORKFLOW.taskId, "架空の流れ", "running", ""],
    ])
    expect(state.delegateRoles[0]?.at).toBe(3_000)
  })

  it("顔ぶれから外れた役は、最後の1行のまま済んだ役として残る", () => {
    const state = applyAt(
      [tasks(AGENT, WORKFLOW), 1_000],
      [progress(AGENT, "架空の最後の1行"), 2_000],
      [tasks(WORKFLOW), 3_000],
    )

    expect(shapeOf(state)).toEqual([
      [AGENT.taskId, "架空の実装役", "done", "架空の最後の1行"],
      [WORKFLOW.taskId, "架空の流れ", "running", ""],
    ])
  })

  it("顔ぶれにいない役の進みは無視する", () => {
    const state = applyAt([tasks(SHELL), 1_000], [progress(AGENT, "架空の迷子の1行"), 2_000])

    expect(state.delegateRoles).toEqual([])
  })

  it("帯の段が済むと空になる", () => {
    const state = applyAt(
      [tasks(AGENT), 1_000],
      [progress(AGENT, "架空の1行"), 2_000],
      [
        {
          kind: "delegate-returned",
          handback: { kind: "phase-done", phase: 1, count: 2, summary: "架空のまとめ" },
        },
        3_000,
      ],
    )

    expect(state.delegateRoles).toEqual([])
  })

  it("ターンが終わると済んだ役だけを落とし、背景で走っている役は残す", () => {
    const state = applyAt(
      [tasks(AGENT, WORKFLOW), 1_000],
      [progress(WORKFLOW, "架空の流れの1行"), 2_000],
      [tasks(WORKFLOW), 3_000],
      [{ kind: "turn-finished", outcome: { kind: "completed" } }, 4_000],
    )

    expect(shapeOf(state)).toEqual([[WORKFLOW.taskId, "架空の流れ", "running", "架空の流れの1行"]])
  })

  it("session-ended で空になる", () => {
    const state = applyAt(
      [tasks(AGENT), 1_000],
      [progress(AGENT, "架空の1行"), 2_000],
      [{ kind: "session-ended", reason: "架空の終わり" }, 3_000],
    )

    expect(state.delegateRoles).toEqual([])
  })
})

describe("applySessionEvent（背景で走らせた Bash の終わり）", () => {
  const bashStarted = (toolUseId: string, input: unknown): SessionEvent => ({
    kind: "tool-started",
    toolUseId: checkedToolUseId(toolUseId),
    name: "Bash",
    input,
    parentToolUseId: undefined,
  })
  const accepted = (toolUseId: string): SessionEvent => ({
    kind: "tool-finished",
    toolUseId: checkedToolUseId(toolUseId),
    content: "架空の受付",
    isError: false,
  })
  const notified = (toolUseId: string): SessionEvent => ({
    kind: "background-tool-finished",
    toolUseId: checkedToolUseId(toolUseId),
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
