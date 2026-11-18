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
    ["Read", { file_path: "/a/b.ts" }, "を", "読んでいます", "/a/b.ts"],
    ["Grep", { pattern: "架空" }, "を", "探しています", "架空"],
    ["Glob", { pattern: "*.ts" }, "を", "探しています", "*.ts"],
    ["Edit", { file_path: "/a.ts" }, "を", "書き換えています", "/a.ts"],
    ["MultiEdit", { file_path: "/a.ts" }, "を", "書き換えています", "/a.ts"],
    ["NotebookEdit", { file_path: "/a.ipynb" }, "を", "書き換えています", "/a.ipynb"],
    ["Write", { file_path: "/a.ts" }, "を", "書いています", "/a.ts"],
    ["Bash", { command: "pnpm run test" }, "を", "走らせています", "pnpm run test"],
    ["WebFetch", { url: "https://example.test" }, "を", "調べています", "https://example.test"],
    ["WebSearch", { query: "架空" }, "を", "調べています", "架空"],
  ])("走っている %s は「対象 を 動詞」と経過で言う", (name, input, particle, verb, target) => {
    const statement = doing(nowLineStatementOf(sourceOf({}, [runningStep(name, input)])))
    expect(statement).toMatchObject({
      lead: "",
      target,
      particle,
      verb,
      mono: true,
      elapsed: "5秒",
      aside: "",
    })
  })

  it("表に無い道具・MCP の道具は「<道具の名前> を使っています」と等幅で言う", () => {
    const statement = doing(
      nowLineStatementOf(sourceOf({}, [runningStep("mcp__架空__道具", { a: "b" })])),
    )
    expect(statement).toMatchObject({
      target: "mcp__架空__道具",
      particle: "を",
      verb: "使っています",
      mono: true,
    })
  })

  it("走っている Agent は役（綴りのまま）に任せ、説明を添え書きにする。役が無ければ「委譲先」", () => {
    const both = doing(
      nowLineStatementOf(
        sourceOf({}, [
          runningStep("Agent", { subagent_type: "架空の役", description: "架空の説明" }),
        ]),
      ),
    )
    expect(both).toMatchObject({
      target: "架空の役",
      particle: "に",
      verb: "任せています",
      mono: false,
      aside: "架空の説明",
      elapsed: "5秒",
    })
    const only = doing(
      nowLineStatementOf(sourceOf({}, [runningStep("Task", { description: "架空の説明" })])),
    )
    expect(only).toMatchObject({ target: "委譲先", verb: "任せています", aside: "架空の説明" })
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
    expect(statement).toMatchObject({
      lead: "背景で",
      target: "架空の段",
      particle: "を",
      verb: "進めています",
    })
  })

  it("背景の手順が走っていれば対象の前に「背景で」を添える", () => {
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
      lead: "背景で",
      target: "架空",
      particle: "を",
      verb: "走らせています",
      elapsed: "5秒",
    })
  })

  it("手順を持たないバックグラウンドタスクは「背景で <説明> を走らせています」と言う", () => {
    const statement = doing(
      nowLineStatementOf(
        sourceOf({
          backgroundTasks: [
            { taskId: checkedTaskId("bash-1"), kind: "shell", description: "架空の待ち" },
          ],
        }),
      ),
    )
    expect(statement).toMatchObject({
      lead: "背景で",
      target: "架空の待ち",
      particle: "を",
      verb: "走らせています",
      mono: false,
    })
  })

  it("背景で委譲先が動いていれば「背景で <役> に任せています」と言う", () => {
    const statement = doing(
      nowLineStatementOf(
        sourceOf(
          {
            backgroundTasks: [
              { taskId: checkedTaskId("agent-1"), kind: "agent", description: "架空の説明" },
            ],
          },
          [
            {
              ...runningStep("Agent", { subagent_type: "架空の役", description: "架空の説明" }),
              status: { kind: "done", finishedAt: { kind: "stamped", at: START } },
            },
            {
              ...runningStep("Read", { file_path: "/a.ts" }),
              nested: true,
              status: { kind: "done", finishedAt: { kind: "stamped", at: START } },
            },
          ],
        ),
      ),
    )
    expect(statement).toMatchObject({
      lead: "背景で",
      target: "架空の役",
      particle: "に",
      verb: "任せています",
      aside: "架空の説明",
    })
  })

  it("report を書いている途中は「レポートを書いています」", () => {
    const statement = doing(
      nowLineStatementOf(
        sourceOf({
          reportDrafting: { kind: "drafting", toolUseId: "tu-r", components: [], held: [] },
        }),
      ),
    )
    expect(statement).toMatchObject({
      verb: "レポートを書いています",
      target: "",
      particle: "",
      elapsed: "",
    })
  })

  it("何も走っていなければ「考えています」、依頼が会話の片付けなら「会話を片付けています」", () => {
    expect(doing(nowLineStatementOf(sourceOf()))).toMatchObject({
      verb: "考えています",
      target: "",
      particle: "",
    })
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
      verb: "会話を片付けています",
    })
  })

  it("API の再試行中は「API の応答 を待っています」に回数を添え書きにし、詳細を title 用に持つ", () => {
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
      target: "API の応答",
      particle: "を",
      verb: "待っています",
      aside: "2回目の再試行",
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

  it("手順が 121 秒続いても添え書きを付けず、秒だけが伸びる", () => {
    const statement = doing(
      nowLineStatementOf(
        sourceOf({ now: START + 121_000 }, [runningStep("Bash", { command: "x" })]),
      ),
    )
    expect(statement).toMatchObject({ aside: "", elapsed: "2分01秒" })
  })
})
