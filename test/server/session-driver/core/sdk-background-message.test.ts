import { describe, expect, it } from "vitest"

import { toSessionEvents } from "../../../../src/server/session-driver/core/sdk-message.ts"
import { EXPRESSIONS } from "../../../fixture/sdk-assistant-message.ts"

describe("バックグラウンドタスク（実測で届いた順: background_tasks_changed → task_started → … → background_tasks_changed → task_updated → task_notification）", () => {
  it("background_tasks_changed を background-tasks-changed にする（種類を3つに畳む）", () => {
    const message = {
      type: "system",
      subtype: "background_tasks_changed",
      tasks: [
        { task_id: "bash-1", task_type: "local_bash", description: "架空の待ち" },
        { task_id: "agent-1", task_type: "local_agent", description: "架空の調べ物" },
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

  it("tool_use_id のある task_notification を background-tool-finished にする（状態は区別しない）", () => {
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
    ).toEqual([
      { kind: "background-tool-finished", toolUseId: "toolu_1" },
      { kind: "background-tool-finished", toolUseId: "toolu_1" },
      { kind: "background-tool-finished", toolUseId: "toolu_1" },
    ])
  })

  it("tool_use_id の無い task_notification はイベントにしない（結び付ける記録が無い）", () => {
    const message = {
      type: "system",
      subtype: "task_notification",
      task_id: "bash-1",
      status: "completed",
      output_file: "/tmp/dummy/output",
      summary: "架空の要約",
    }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([])
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
