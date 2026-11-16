import { describe, expect, it } from "vitest"

import {
  nowLineStatementOf,
  type NowLineStatement,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/now-line-statement.ts"
import type { WorkActivitySource } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/work-activity.ts"
import type { BackgroundTask } from "../../../../../../../../src/shared/session-driver/background-task.ts"
import type { TurnStep } from "../../../../../../../../src/shared/session/turn-step.ts"
import { EMPTY_WORK_PLAN_TRAIL } from "../../../../../../../../src/shared/session/work-plan-trail.ts"
import { checkedTaskId } from "../../../../../../../fixture/task-id.ts"
import { checkedToolUseId } from "../../../../../../../fixture/tool-use-id.ts"

const START = 1_700_000_000_000

function runningStep(name: string, input: unknown, startedAt = START): TurnStep {
  return {
    toolUseId: `tu-${name}`,
    name,
    input,
    nested: false,
    startedAt: { kind: "stamped", at: startedAt },
    status: { kind: "running" },
    backgroundEnd: { kind: "foreground" },
    phase: { kind: "none" },
  }
}

function sourceOf(overrides: Partial<WorkActivitySource> = {}, steps: readonly TurnStep[] = []) {
  return {
    turnStepList: { kind: "turn", steps, plan: { kind: "none" }, trail: EMPTY_WORK_PLAN_TRAIL },
    reportDrafting: { kind: "idle" },
    backgroundTasks: [],
    workflowSteps: [],
    workflowProgress: [],
    turn: { kind: "running", startedAt: START },
    apiTrouble: { kind: "none" },
    records: [],
    now: START + 5_000,
    ...overrides,
  } satisfies WorkActivitySource
}

function doing(statement: NowLineStatement) {
  if (statement.kind !== "doing") {
    throw new Error("doing を期待した")
  }
  return statement
}

describe("nowLineStatementOf", () => {
  it.each([
    ["Read", { file_path: "/a/b.ts" }, "読んでいる", "/a/b.ts"],
    ["Grep", { pattern: "架空" }, "探している", "架空"],
    ["Glob", { pattern: "*.ts" }, "探している", "*.ts"],
    ["Edit", { file_path: "/a.ts" }, "書き換えている", "/a.ts"],
    ["MultiEdit", { file_path: "/a.ts" }, "書き換えている", "/a.ts"],
    ["NotebookEdit", { file_path: "/a.ipynb" }, "書き換えている", "/a.ipynb"],
    ["Write", { file_path: "/a.ts" }, "書いている", "/a.ts"],
    ["Bash", { command: "pnpm run test" }, "コマンドを走らせている", "pnpm run test"],
    ["WebFetch", { url: "https://example.test" }, "調べている", "https://example.test"],
    ["WebSearch", { query: "架空" }, "調べている", "架空"],
  ])("走っている %s は動詞と対象と経過で言う", (name, input, verb, target) => {
    const statement = doing(nowLineStatementOf(sourceOf({}, [runningStep(name, input)])))
    expect(statement).toMatchObject({ verb, target, mono: true, elapsed: "5秒", remark: "" })
  })

  it("表に無い道具・MCP の道具は「道具を使っている」に道具の名前を等幅で添える", () => {
    const statement = doing(
      nowLineStatementOf(sourceOf({}, [runningStep("mcp__架空__道具", { a: "b" })])),
    )
    expect(statement).toMatchObject({
      verb: "道具を使っている",
      target: "mcp__架空__道具",
      mono: true,
    })
  })

  it("走っている Agent は役と説明の両方を、役が無ければ説明だけを対象にする", () => {
    const both = doing(
      nowLineStatementOf(
        sourceOf({}, [
          runningStep("Agent", { subagent_type: "架空の役", description: "架空の説明" }),
        ]),
      ),
    )
    expect(both).toMatchObject({ verb: "委譲先に任せている", target: "架空の役 · 架空の説明" })
    const only = doing(
      nowLineStatementOf(sourceOf({}, [runningStep("Task", { description: "架空の説明" })])),
    )
    expect(only).toMatchObject({ verb: "委譲先に任せている", target: "架空の説明" })
  })

  const WORKFLOW = {
    taskId: checkedTaskId("wf-1"),
    kind: "workflow",
    description: "架空の流れ",
  } satisfies BackgroundTask

  it("背景のワークフロースクリプトの agent が手順の合間に走っていれば段の題を対象にする", () => {
    const statement = doing(
      nowLineStatementOf(
        sourceOf({
          backgroundTasks: [WORKFLOW],
          workflowSteps: [
            {
              taskId: WORKFLOW.taskId,
              agentId: "agent-1",
              toolUseId: checkedToolUseId("tu-1"),
              name: "Read",
              input: {},
              startedAt: START,
              running: false,
            },
          ],
          workflowProgress: [
            {
              taskId: WORKFLOW.taskId,
              phases: [],
              agents: [{ index: 0, agentId: "agent-1", state: "progress", phaseTitle: "架空の段" }],
            },
          ],
        }),
      ),
    )
    expect(statement).toMatchObject({ verb: "背景で 委譲先に任せている", target: "架空の段" })
  })

  it("背景の手順が走っていれば動詞の前に「背景で」を添える", () => {
    const statement = doing(
      nowLineStatementOf(
        sourceOf({
          backgroundTasks: [WORKFLOW],
          workflowSteps: [
            {
              taskId: WORKFLOW.taskId,
              agentId: "agent-1",
              toolUseId: checkedToolUseId("tu-1"),
              name: "Bash",
              input: { command: "架空" },
              startedAt: START,
              running: true,
            },
          ],
        }),
      ),
    )
    expect(statement).toMatchObject({
      verb: "背景で コマンドを走らせている",
      target: "架空",
      elapsed: "5秒",
    })
  })

  it("手順を持たないバックグラウンドタスクは「背景で <説明>」を動詞なしで言う", () => {
    const statement = doing(
      nowLineStatementOf(
        sourceOf({
          backgroundTasks: [
            { taskId: checkedTaskId("bash-1"), kind: "shell", description: "架空の待ち" },
          ],
        }),
      ),
    )
    expect(statement).toMatchObject({ verb: "背景で", target: "架空の待ち", mono: false })
  })

  it("report を書いている途中は「レポートを書いている」", () => {
    const statement = doing(
      nowLineStatementOf(
        sourceOf({
          reportDrafting: { kind: "drafting", toolUseId: "tu-r", components: [], held: [] },
        }),
      ),
    )
    expect(statement).toMatchObject({ verb: "レポートを書いている", target: "", elapsed: "" })
  })

  it("何も走っていなければ「考えている」、依頼が会話の片付けなら「会話を片付けている」", () => {
    expect(doing(nowLineStatementOf(sourceOf()))).toMatchObject({ verb: "考えている" })
    const records: WorkActivitySource["records"] = [
      {
        kind: "request",
        turnId: 1,
        text: "/clear",
        images: [],
        time: { kind: "stamped", at: START },
      },
    ]
    expect(doing(nowLineStatementOf(sourceOf({ records })))).toMatchObject({
      verb: "会話を片付けている",
    })
  })

  it("API の再試行中は「もう一度試している」に回数を添え、詳細を title 用に持つ", () => {
    const statement = doing(
      nowLineStatementOf(
        sourceOf({
          apiTrouble: {
            kind: "retrying",
            at: START,
            attempt: 2,
            maxRetries: 10,
            retryDelayMs: 4_000,
            error: "overloaded",
          },
        }),
      ),
    )
    expect(statement).toMatchObject({
      verb: "もう一度試している",
      target: "API の応答待ち · 2回目",
    })
    expect(statement.retryDetail).toContain("4秒")
  })

  it("答え待ちは行を出さない", () => {
    expect(
      nowLineStatementOf(
        sourceOf({
          firstPending: {
            kind: "permission",
            id: "ask-1",
            toolName: "Bash",
            input: {},
            askedAt: START,
          },
        }),
      ),
    ).toEqual({ kind: "asking" })
  })

  it("同じ手順が 120 秒ちょうどでは添え書きなし、121 秒で「長く掛かっている」", () => {
    const at = (seconds: number) =>
      doing(
        nowLineStatementOf(
          sourceOf({ now: START + seconds * 1000 }, [runningStep("Bash", { command: "x" })]),
        ),
      )
    expect(at(120)).toMatchObject({ remark: "", longRunning: false })
    expect(at(121)).toMatchObject({
      remark: "長く掛かっている",
      longRunning: true,
    })
  })

  it("委譲先に任せている状態は 121 秒でも添え書きを付けない", () => {
    const statement = doing(
      nowLineStatementOf(
        sourceOf({ now: START + 121_000 }, [runningStep("Agent", { description: "架空" })]),
      ),
    )
    expect(statement).toMatchObject({ remark: "", longRunning: false })
  })
})
