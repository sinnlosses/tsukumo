import { describe, expect, it } from "vitest"

import { toSessionEvents } from "../../../../../src/server/session-driver/core/message/sdk-message.ts"
import { EXPRESSIONS } from "../../../../fixture/sdk-assistant-message.ts"

describe("バックグラウンドタスク（実測で届いた順: background_tasks_changed → task_started → … → background_tasks_changed → task_updated → task_notification）", () => {
  it("background_tasks_changed を background-tasks-changed にする（種類を4つに畳む）", () => {
    const message = {
      type: "system",
      subtype: "background_tasks_changed",
      tasks: [
        { task_id: "bash-1", task_type: "local_bash", description: "架空の待ち" },
        { task_id: "agent-1", task_type: "local_agent", description: "架空の調べ物" },
        { task_id: "wf-1", task_type: "local_workflow", description: "架空の流れ" },
        { task_id: "other-1", task_type: "架空の未知の種類", description: "架空の何か" },
      ],
      uuid: "u-1",
      session_id: "s-1",
    }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      {
        kind: "background-tasks-changed",
        tasks: [
          { taskId: "bash-1", kind: "shell", description: "架空の待ち" },
          { taskId: "agent-1", kind: "agent", description: "架空の調べ物" },
          { taskId: "wf-1", kind: "workflow", description: "架空の流れ" },
          { taskId: "other-1", kind: "other", description: "架空の何か" },
        ],
      },
    ])
  })

  it("終わって顔ぶれが空になった知らせも空の並びとして運ぶ（受け取る側が置き換える）", () => {
    const message = { type: "system", subtype: "background_tasks_changed", tasks: [] }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      { kind: "background-tasks-changed", tasks: [] },
    ])
  })

  it("ambient（活動でないもの）と task_id の無い要素は落とし、説明が無ければ空に畳む", () => {
    const message = {
      type: "system",
      subtype: "background_tasks_changed",
      tasks: [
        {
          task_id: "watch-1",
          task_type: "local_bash",
          description: "架空の見張り",
          ambient: true,
        },
        { task_type: "local_bash", description: "id の無い架空の要素" },
        "壊れた要素",
        { task_id: "bash-2", task_type: "local_bash" },
      ],
    }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      {
        kind: "background-tasks-changed",
        tasks: [{ taskId: "bash-2", kind: "shell", description: "" }],
      },
    ])
  })

  it("tasks が配列でない壊れた知らせはイベントにしない（動いているものを空に倒さない）", () => {
    expect(
      toSessionEvents({ type: "system", subtype: "background_tasks_changed" }, EXPRESSIONS),
    ).toEqual([])
  })

  it("summary のある task_progress だけを delegate-progress にする", () => {
    const progress = (summary: unknown) => ({
      type: "system",
      subtype: "task_progress",
      task_id: "agent-1",
      description: "架空の調べ物",
      usage: { total_tokens: 1, tool_uses: 0, duration_ms: 1 },
      summary,
    })

    expect(
      ["架空の進み", "   ", undefined, 1].flatMap((summary) =>
        toSessionEvents(progress(summary), EXPRESSIONS),
      ),
    ).toEqual([{ kind: "delegate-progress", taskId: "agent-1", summary: "架空の進み" }])
  })

  it("task_id の無い task_progress はイベントにしない", () => {
    expect(
      toSessionEvents(
        { type: "system", subtype: "task_progress", summary: "架空の進み" },
        EXPRESSIONS,
      ),
    ).toEqual([])
  })

  describe("workflow_progress（SDK の公開の型に無い欄。形を確かめ、外れた要素は捨てる）", () => {
    const workflowProgress = (workflow_progress: unknown, extra: Record<string, unknown> = {}) => ({
      type: "system",
      subtype: "task_progress",
      task_id: "wf-1",
      description: "架空の台本",
      usage: { total_tokens: 1, tool_uses: 0, duration_ms: 1 },
      workflow_progress,
      ...extra,
    })
    const agent = (overrides: Record<string, unknown> = {}) => ({
      type: "workflow_agent",
      index: 0,
      state: "start",
      agentId: "agent-1",
      label: "架空の名札",
      lastToolSummary: "架空の要約",
      ...overrides,
    })

    it("workflow_progress が無い・配列でないときは workflow-progress を出さない（summary があれば delegate-progress だけ）", () => {
      expect(toSessionEvents(workflowProgress(undefined), EXPRESSIONS)).toEqual([])
      expect(toSessionEvents(workflowProgress({ type: "workflow_agent" }), EXPRESSIONS)).toEqual([])
      expect(
        toSessionEvents(workflowProgress("架空", { summary: "架空の進み" }), EXPRESSIONS),
      ).toEqual([{ kind: "delegate-progress", taskId: "wf-1", summary: "架空の進み" }])
    })

    it("task_id が文字列でないときは workflow-progress を出さない", () => {
      expect(toSessionEvents(workflowProgress([agent()], { task_id: 1 }), EXPRESSIONS)).toEqual([])
    })

    it("workflow_phase と workflow_agent を phases と agents に入れる（入力の順のまま。会話の断片になりうる欄は写さない）", () => {
      const elements = [
        { type: "workflow_phase", index: 0, title: "架空の段A" },
        agent({ index: 0, agentId: "agent-1", state: "start" }),
        { type: "workflow_phase", index: 1, title: "架空の段B" },
        agent({ index: 1, agentId: "agent-2", state: "done" }),
        agent({ index: 2, agentId: "agent-0", state: "error" }),
        agent({ index: 3, agentId: "agent-3", state: "progress" }),
      ]

      expect(toSessionEvents(workflowProgress(elements), EXPRESSIONS)).toEqual([
        {
          kind: "workflow-progress",
          progress: {
            taskId: "wf-1",
            phases: [
              { index: 0, title: "架空の段A" },
              { index: 1, title: "架空の段B" },
            ],
            agents: [
              { index: 0, agentId: "agent-1", state: "start" },
              { index: 1, agentId: "agent-2", state: "done" },
              { index: 2, agentId: "agent-0", state: "error" },
              { index: 3, agentId: "agent-3", state: "progress" },
            ],
          },
        },
      ])
    })

    it("形の外れた要素だけを捨てる（agentId の無い待ち行列の写し・知らない state・index の欠け・知らない type・オブジェクトでない要素）", () => {
      const elements = [
        { type: "workflow_phase", index: "0", title: "架空の段" },
        { type: "workflow_phase", index: 1.5, title: "架空の段" },
        { type: "workflow_phase", index: 2, title: 3 },
        { type: "workflow_phase", index: 3, title: "残る段" },
        { type: "workflow_agent", index: 0, state: "start", queuedAt: 1 },
        agent({ index: 1, state: "paused" }),
        agent({ index: undefined }),
        agent({ index: 3, agentId: 7 }),
        agent({ index: 4, agentId: "agent-4", state: "progress" }),
        { type: "workflow_log", index: 5, title: "架空のログ", agentId: "agent-5", state: "start" },
        { index: 6, title: "type の無い要素" },
        "壊れた要素",
        null,
      ]

      expect(toSessionEvents(workflowProgress(elements), EXPRESSIONS)).toEqual([
        {
          kind: "workflow-progress",
          progress: {
            taskId: "wf-1",
            phases: [{ index: 3, title: "残る段" }],
            agents: [{ index: 4, agentId: "agent-4", state: "progress" }],
          },
        },
      ])
    })

    it("空の配列は空の phases と agents の workflow-progress にする（丸ごと置き換える合図）", () => {
      expect(toSessionEvents(workflowProgress([]), EXPRESSIONS)).toEqual([
        { kind: "workflow-progress", progress: { taskId: "wf-1", phases: [], agents: [] } },
      ])
    })

    it("summary と workflow_progress の両方があれば delegate-progress と workflow-progress の両方にする", () => {
      expect(
        toSessionEvents(workflowProgress([agent()], { summary: "架空の進み" }), EXPRESSIONS),
      ).toEqual([
        { kind: "delegate-progress", taskId: "wf-1", summary: "架空の進み" },
        {
          kind: "workflow-progress",
          progress: {
            taskId: "wf-1",
            phases: [],
            agents: [{ index: 0, agentId: "agent-1", state: "start" }],
          },
        },
      ])
    })
  })

  it("task_started / summary の無い task_progress / task_updated はイベントにしない（顔ぶれは background_tasks_changed だけで分かる）", () => {
    const edges = [
      {
        type: "system",
        subtype: "task_started",
        task_id: "bash-1",
        tool_use_id: "toolu_1",
        description: "架空の待ち",
        task_type: "local_bash",
        is_backgrounded: true,
      },
      {
        type: "system",
        subtype: "task_progress",
        task_id: "agent-1",
        description: "架空の調べ物",
        usage: { total_tokens: 1, tool_uses: 0, duration_ms: 1 },
      },
      {
        type: "system",
        subtype: "task_updated",
        task_id: "bash-1",
        patch: { status: "completed", end_time: 1 },
      },
    ]

    expect(edges.flatMap((message) => toSessionEvents(message, EXPRESSIONS))).toEqual([])
  })

  it("tool_use_id のある task_notification を background-tool-finished と task-notified にする（状態は区別しない）", () => {
    const notification = (status: string) => ({
      type: "system",
      subtype: "task_notification",
      task_id: "bash-1",
      tool_use_id: "toolu_1",
      status,
      output_file: "/tmp/dummy/output",
      summary: "架空の要約",
    })

    expect(
      ["completed", "failed", "stopped"].flatMap((status) =>
        toSessionEvents(notification(status), EXPRESSIONS),
      ),
    ).toEqual(
      Array.from({ length: 3 }, () => [
        { kind: "background-tool-finished", toolUseId: "toolu_1" },
        { kind: "task-notified", taskId: "bash-1" },
      ]).flat(),
    )
  })

  it("tool_use_id の無い task_notification は task-notified だけにする（ツールに結び付ける記録が無い）", () => {
    const message = {
      type: "system",
      subtype: "task_notification",
      task_id: "bash-1",
      status: "completed",
      output_file: "/tmp/dummy/output",
      summary: "架空の要約",
    }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      { kind: "task-notified", taskId: "bash-1" },
    ])
  })

  it("task_type が local_workflow の task_started だけを workflow-started にする", () => {
    const started = (taskType: string) => ({
      type: "system",
      subtype: "task_started",
      task_id: "wf-1",
      description: "架空の台本",
      task_type: taskType,
    })

    expect(toSessionEvents(started("local_workflow"), EXPRESSIONS)).toEqual([
      { kind: "workflow-started", taskId: "wf-1" },
    ])
    expect(toSessionEvents(started("local_agent"), EXPRESSIONS)).toEqual([])
  })

  it("知らせのあとの続きのターンの result（origin が task-notification）も turn-finished にする", () => {
    const message = {
      type: "result",
      subtype: "success",
      parent_tool_use_id: null,
      origin: { kind: "task-notification" },
    }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      { kind: "turn-finished", outcome: { kind: "completed" } },
    ])
  })
})
