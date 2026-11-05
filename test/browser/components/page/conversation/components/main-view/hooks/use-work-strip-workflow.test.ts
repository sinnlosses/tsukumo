import { cleanup } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { BackgroundTask } from "../../../../../../../../src/shared/session-driver/background-task.ts"
import type { SessionEvent } from "../../../../../../../../src/shared/session/session-event.ts"
import { checkedToolUseId } from "../../../../../../../fixture/tool-use-id.ts"
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
const progressOf = (taskId: string, ...agentIds: readonly string[]): SessionEvent => ({
  kind: "workflow-progress",
  progress: {
    taskId,
    phases: [],
    agents: agentIds.map((agentId, index) => ({
      index,
      agentId,
      state: "progress",
      phaseTitle: "架空の段",
    })),
  },
})
const WORKFLOW_PROGRESS = progressOf("wf-1", "agent-1")
const stepStarted = (
  name: string,
  input: Readonly<Record<string, string>>,
  agentId = "agent-1",
): SessionEvent => ({
  kind: "workflow-step-started",
  agentId,
  toolUseId: checkedToolUseId(`tu-${name}`),
  name,
  input,
})
const stepFinished = (name: string, agentId = "agent-1"): SessionEvent => ({
  kind: "workflow-step-finished",
  agentId,
  toolUseId: checkedToolUseId(`tu-${name}`),
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
    expect(activityAfter(tasksChanged(WORKFLOW), WORKFLOW_PROGRESS, completed)).toBe(
      "背景で 架空の流れ",
    )
    expect(
      activityAfter(
        tasksChanged(WORKFLOW),
        WORKFLOW_PROGRESS,
        completed,
        stepStarted("Bash", { command: "架空のコマンド" }),
      ),
    ).toBe("背景で · Bash  架空のコマンド · 55秒")
    expect(
      activityAfter(
        tasksChanged(WORKFLOW),
        WORKFLOW_PROGRESS,
        completed,
        stepStarted("Bash", { command: "架空のコマンド" }),
        stepStarted("Read", { file_path: "/架空/a.ts" }),
      ),
    ).toBe("背景で · Read  /架空/a.ts · 54秒")
  })

  it("手順が終わって agent が走っていれば「背景で · 考えている」、agent が全部 done ならワークフロースクリプトの説明に戻る", () => {
    const base = [
      tasksChanged(WORKFLOW),
      WORKFLOW_PROGRESS,
      stepStarted("Bash", { command: "架空のコマンド" }),
    ]
    expect(activityAfter(...base, stepFinished("Bash"))).toBe("背景で · 考えている")
    expect(
      activityAfter(
        ...base,
        stepFinished("Bash"),
        stepStarted("Read", { file_path: "/架空/a.ts" }),
      ),
    ).toBe("背景で · Read  /架空/a.ts · 54秒")
    expect(
      activityAfter(...base, stepFinished("Bash"), {
        kind: "workflow-progress",
        progress: {
          taskId: "wf-1",
          phases: [],
          agents: [{ index: 0, agentId: "agent-1", state: "done", phaseTitle: "" }],
        },
      }),
    ).toBe("背景で 架空の流れ")
  })

  it("ワークフロースクリプトが顔ぶれから外れると手順は消え、同じ id で始め直しても前の手順は出ない", () => {
    const events = [
      tasksChanged(WORKFLOW),
      WORKFLOW_PROGRESS,
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
        WORKFLOW_PROGRESS,
        stepStarted("Bash", { command: "架空のコマンド" }),
        { kind: "session-ended", reason: "セッションが終了した" },
        workRequest,
        plan,
        tasksChanged(WORKFLOW),
      ),
    ).toBe("背景で 架空の流れ")
  })

  it("ワークフロースクリプトの手順が届いたあとに背景の Bash が立っても、2行目はその手順のまま", () => {
    expect(
      activityAfter(
        tasksChanged(WORKFLOW),
        WORKFLOW_PROGRESS,
        stepStarted("Bash", { command: "架空のコマンド" }),
        tasksChanged(WORKFLOW, SHELL),
      ),
    ).toBe("背景で · Bash  架空のコマンド · 56秒")
  })

  it("手順を持つワークフロースクリプトとサブエージェントがいれば、新しく始まった方を出す", () => {
    const agentTask = {
      taskId: "agent-task-1",
      kind: "agent",
      description: "架空の委譲",
    } satisfies BackgroundTask
    const nestedRead: readonly SessionEvent[] = [
      {
        kind: "tool-started",
        toolUseId: checkedToolUseId("nested-1"),
        name: "Read",
        input: { file_path: "/架空/a.ts" },
        parentToolUseId: checkedToolUseId("parent-1"),
      },
      {
        kind: "tool-finished",
        toolUseId: checkedToolUseId("nested-1"),
        content: "架空の結果",
        isError: false,
      },
    ]
    const bash = stepStarted("Bash", { command: "架空のコマンド" })
    const head = [tasksChanged(WORKFLOW, agentTask), WORKFLOW_PROGRESS]
    expect(activityAfter(...head, ...nestedRead, bash)).toBe("背景で · Bash  架空のコマンド · 54秒")
    expect(activityAfter(...head, bash, ...nestedRead)).toBe("背景で · 考えている")
  })

  it("手順を持つワークフロースクリプトが2本あれば、新しく始まった方を出す", () => {
    const second = {
      taskId: "wf-2",
      kind: "workflow",
      description: "架空の別の流れ",
    } satisfies BackgroundTask
    expect(
      activityAfter(
        tasksChanged(WORKFLOW, second),
        WORKFLOW_PROGRESS,
        progressOf("wf-2", "agent-2"),
        stepStarted("Bash", { command: "架空のコマンド" }),
        stepStarted("Read", { file_path: "/架空/a.ts" }, "agent-2"),
        stepStarted("Glob", { pattern: "架空" }),
      ),
    ).toBe("背景で · Glob  架空 · 53秒")
  })

  it("ワークフロースクリプトが動いていないときに届いた手順は捨てる", () => {
    expect(
      activityAfter(stepStarted("Bash", { command: "架空のコマンド" }), tasksChanged(WORKFLOW)),
    ).toBe("背景で 架空の流れ")
  })

  it("ワークフロースクリプトの agent でない agent_id の手順では2行目が替わらない", () => {
    expect(
      activityAfter(
        tasksChanged(WORKFLOW),
        WORKFLOW_PROGRESS,
        stepStarted("Bash", { command: "架空のコマンド" }),
        stepStarted("Read", { file_path: "/架空/a.ts" }, "subagent-1"),
        completed,
      ),
    ).toBe("背景で · Bash  架空のコマンド · 56秒")
  })

  it("背景のサブエージェントの手順が済んでいれば「背景で · 考えている」にする", () => {
    expect(
      activityAfter(
        {
          kind: "background-tasks-changed",
          tasks: [{ taskId: "agent-task-1", kind: "agent", description: "架空の委譲" }],
        },
        {
          kind: "tool-started",
          toolUseId: checkedToolUseId("nested-1"),
          name: "Read",
          input: { file_path: "/架空/a.ts" },
          parentToolUseId: checkedToolUseId("parent-1"),
        },
        {
          kind: "tool-finished",
          toolUseId: checkedToolUseId("nested-1"),
          content: "架空の結果",
          isError: false,
        },
        completed,
      ),
    ).toBe("背景で · 考えている")
  })

  it("ワークフロースクリプトの写しが届く前の手順は捨てる", () => {
    expect(
      activityAfter(
        tasksChanged(WORKFLOW),
        stepStarted("Bash", { command: "架空のコマンド" }),
        WORKFLOW_PROGRESS,
        completed,
      ),
    ).toBe("背景で 架空の流れ")
  })
})
