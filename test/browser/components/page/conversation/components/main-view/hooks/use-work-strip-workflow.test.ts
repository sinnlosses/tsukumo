import { cleanup } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { BackgroundTask } from "../../../../../../../../src/shared/session-driver/background-task.ts"
import type { SessionEvent } from "../../../../../../../../src/shared/session/session-event.ts"
import {
  foldTimed,
  plan,
  START,
  stripAt,
  workRequest,
} from "../../../../../../../fixture/work-strip.ts"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const WORKFLOW = {
  taskId: "wf-1",
  kind: "workflow",
  description: "架空の流れ",
} satisfies BackgroundTask
const SHELL = {
  taskId: "bash-1",
  kind: "shell",
  description: "架空の待ち",
} satisfies BackgroundTask

const tasksChanged = (...tasks: readonly BackgroundTask[]): SessionEvent => ({
  kind: "background-tasks-changed",
  tasks,
})
const stepStarted = (name: string, input: Readonly<Record<string, string>>): SessionEvent => ({
  kind: "workflow-step-started",
  name,
  input,
})
const completed: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }

function activityAfter(...events: readonly SessionEvent[]): string | undefined {
  const strip = stripAt(
    foldTimed(
      [workRequest, plan, ...events].map((event, index) => [event, START + index * 1_000] as const),
    ),
    START + 60_000,
  )
  return strip.kind === "working" ? strip.activity.text : undefined
}

describe("useWorkStrip（ワークフロースクリプトの中の手順）", () => {
  it("手順が届くまでは説明、届いたらいちばん新しく始まった手順の要約に書き換わる", () => {
    expect(activityAfter(tasksChanged(WORKFLOW), completed)).toBe("背景で 架空の流れ")
    expect(
      activityAfter(
        tasksChanged(WORKFLOW),
        completed,
        stepStarted("Bash", { command: "架空のコマンド" }),
      ),
    ).toBe("背景で · Bash  架空のコマンド")
    expect(
      activityAfter(
        tasksChanged(WORKFLOW),
        completed,
        stepStarted("Bash", { command: "架空のコマンド" }),
        stepStarted("Read", { file_path: "/架空/a.ts" }),
      ),
    ).toBe("背景で · Read  /架空/a.ts")
  })

  it("ワークフロースクリプトが顔ぶれから外れると手順は消え、同じ id で始め直しても前の手順は出ない", () => {
    const events = [
      tasksChanged(WORKFLOW),
      stepStarted("Bash", { command: "架空のコマンド" }),
      tasksChanged(),
    ]
    expect(activityAfter(...events)).toBe("考えている")
    expect(activityAfter(...events, tasksChanged(WORKFLOW))).toBe("背景で 架空の流れ")
  })

  it("session-ended のあとは手順を持ち越さない", () => {
    expect(
      activityAfter(
        tasksChanged(WORKFLOW),
        stepStarted("Bash", { command: "架空のコマンド" }),
        { kind: "session-ended", reason: "セッションが終了した" },
        workRequest,
        plan,
        tasksChanged(WORKFLOW),
      ),
    ).toBe("背景で 架空の流れ")
  })

  it("いちばん新しいバックグラウンドタスクがワークフロースクリプトでなければ、手順は出さない", () => {
    expect(
      activityAfter(
        tasksChanged(WORKFLOW),
        stepStarted("Bash", { command: "架空のコマンド" }),
        tasksChanged(WORKFLOW, SHELL),
      ),
    ).toBe("背景で 架空の待ち ほか1件")
  })

  it("ワークフロースクリプトが動いていないときに届いた手順は捨てる", () => {
    expect(
      activityAfter(stepStarted("Bash", { command: "架空のコマンド" }), tasksChanged(WORKFLOW)),
    ).toBe("背景で 架空の流れ")
  })
})
