import { describe, expect, it } from "bun:test"

import {
  isSubagentMessage,
  REPORT_TOOL_NAME,
  TSUKUMO_MCP_SERVER_NAME,
  SPEAK_TOOL_NAME,
  toCommandDescriptions,
  toPlan,
  toSessionEvents,
} from "../../../src/server/core/sdk-message.ts"
import { type Expression } from "../../../src/shared/expression.ts"

// フィクスチャはすべて手で書いた架空のやり取り。**実物の会話は使わない**
// （docs/coding-standards.md「会話内容の扱い」）。
const EXPRESSIONS: readonly Expression[] = ["default", "thinking", "proud"]

const SPEAK_TOOL_FULL_NAME = `mcp__${TSUKUMO_MCP_SERVER_NAME}__${SPEAK_TOOL_NAME}`

function assistantMessage(
  content: readonly unknown[],
  parentToolUseId?: string,
): Record<string, unknown> {
  return {
    type: "assistant",
    message: { role: "assistant", content },
    session_id: "s-1",
    parent_tool_use_id: parentToolUseId ?? null,
  }
}

describe("toSessionEvents", () => {
  it("assistant のテキストをターンの本文にする", () => {
    const message = assistantMessage([{ type: "text", text: "ダミーの本文です。" }])

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      { kind: "utterance", text: "ダミーの本文です。" },
    ])
  })

  it("空白だけのテキストは本文にしない", () => {
    const message = assistantMessage([{ type: "text", text: "   \n" }])

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([])
  })

  it("ゼロ幅スペースのような見えない文字だけのテキストも本文にしない", () => {
    const message = assistantMessage([{ type: "text", text: "​\n﻿" }])

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([])
  })

  it("thinking は変換しない（内部の型にも入れない）", () => {
    const message = assistantMessage([
      { type: "thinking", thinking: "ダミーの思考" },
      { type: "text", text: "ダミーの本文です。" },
    ])

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      { kind: "utterance", text: "ダミーの本文です。" },
    ])
  })

  it("stream_event の text_delta を書きかけの本文にする", () => {
    const message = {
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ダミ" } },
    }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      { kind: "partial-utterance", text: "ダミ" },
    ])
  })

  it("stream_event でも本文以外の断片は無視する", () => {
    const started = {
      type: "stream_event",
      event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    }
    const thinking = {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "thinking_delta", thinking: "ダミーの思考" },
      },
    }

    expect(toSessionEvents(started, EXPRESSIONS)).toEqual([])
    expect(toSessionEvents(thinking, EXPRESSIONS)).toEqual([])
  })

  it("tool_use をツールの開始にする", () => {
    const message = assistantMessage([
      { type: "tool_use", id: "toolu_1", name: "Read", input: { file_path: "/tmp/dummy.txt" } },
    ])

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      {
        kind: "tool-started",
        toolUseId: "toolu_1",
        name: "Read",
        input: { file_path: "/tmp/dummy.txt" },
        parentToolUseId: undefined,
      },
    ])
  })

  it("1つの assistant メッセージに本文とツールが並んでいても両方拾う", () => {
    const message = assistantMessage([
      { type: "text", text: "ダミーの本文です。" },
      { type: "tool_use", id: "toolu_1", name: "Read", input: {} },
    ])

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      { kind: "utterance", text: "ダミーの本文です。" },
      {
        kind: "tool-started",
        toolUseId: "toolu_1",
        name: "Read",
        input: {},
        parentToolUseId: undefined,
      },
    ])
  })

  it("サブエージェントの中の tool_use は parent_tool_use_id を parentToolUseId に乗せる", () => {
    const message = assistantMessage(
      [{ type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "echo dummy" } }],
      "toolu_agent",
    )

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      {
        kind: "tool-started",
        toolUseId: "toolu_1",
        name: "Bash",
        input: { command: "echo dummy" },
        parentToolUseId: "toolu_agent",
      },
    ])
  })

  it("local_command_run が /model のときモデル変更のイベントを出す（2026-09-17 実測）", () => {
    const message = {
      ...assistantMessage([{ type: "text", text: "ダミーの本文です。" }]),
      local_command_run: { command: "model", args: "haiku" },
    }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      { kind: "utterance", text: "ダミーの本文です。" },
      { kind: "model-changed", model: "haiku" },
    ])
  })

  it("local_command_run の args の前後の空白は除く", () => {
    const message = {
      ...assistantMessage([]),
      local_command_run: { command: "model", args: "  opus  " },
    }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      { kind: "model-changed", model: "opus" },
    ])
  })

  it("local_command_run の command が model 以外のときは何も出さない", () => {
    const message = {
      ...assistantMessage([]),
      local_command_run: { command: "clear", args: "" },
    }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([])
  })

  it("local_command_run に args が無いときは何も出さない", () => {
    const message = { ...assistantMessage([]), local_command_run: { command: "model" } }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([])
  })

  it("引数なしの /model（args が空）では何も出さない", () => {
    const message = { ...assistantMessage([]), local_command_run: { command: "model", args: " " } }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([])
  })

  it("local_command_run が無い通常のメッセージでは何も出さない", () => {
    const message = assistantMessage([{ type: "text", text: "ダミーの本文です。" }])

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      { kind: "utterance", text: "ダミーの本文です。" },
    ])
  })

  it("tool_result をツールの終了にする", () => {
    const message = {
      type: "user",
      message: {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "toolu_1", content: "ダミーの結果", is_error: false },
        ],
      },
    }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      { kind: "tool-finished", toolUseId: "toolu_1", content: "ダミーの結果", isError: false },
    ])
  })

  it("tool_result の content がブロックの配列でも、テキストだけをつなぐ", () => {
    const message = {
      type: "user",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_1",
            content: [
              { type: "text", text: "1行目" },
              { type: "image", source: {} },
            ],
            is_error: true,
          },
        ],
      },
    }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      { kind: "tool-finished", toolUseId: "toolu_1", content: "1行目\n\n(image)", isError: true },
    ])
  })

  it("speak の呼び出しはセリフにする（ツールの開始にはしない）", () => {
    const message = assistantMessage([
      {
        type: "tool_use",
        id: "toolu_2",
        name: SPEAK_TOOL_FULL_NAME,
        input: { text: "いくよ！", expression: "proud" },
      },
    ])

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      { kind: "speech", text: "いくよ！", expression: "proud" },
    ])
  })

  it("キャラクター定義に無い表情名は default に落とす", () => {
    const message = assistantMessage([
      {
        type: "tool_use",
        id: "toolu_2",
        name: SPEAK_TOOL_FULL_NAME,
        input: { text: "いくよ！", expression: "flustered" },
      },
    ])

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      { kind: "speech", text: "いくよ！", expression: "default" },
    ])
  })

  it("speak の text が無いときはセリフにしない", () => {
    const message = assistantMessage([
      {
        type: "tool_use",
        id: "toolu_2",
        name: SPEAK_TOOL_FULL_NAME,
        input: { expression: "proud" },
      },
    ])

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([])
  })

  it("system の init からセッション情報を取り出す", () => {
    const message = {
      type: "system",
      subtype: "init",
      session_id: "session-dummy",
      model: "claude-opus-5",
      permissionMode: "auto",
      slash_commands: ["clear", "model", 7],
      terminal_slash_commands: ["doctor", 7],
      output_style: "Asuna",
    }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      {
        kind: "session-info",
        sessionId: "session-dummy",
        model: "claude-opus-5",
        permissionMode: "auto",
        slashCommands: ["clear", "model"],
        terminalSlashCommands: ["doctor"],
      },
    ])
  })

  it("terminal_slash_commands が無いときは空配列にする", () => {
    const message = {
      type: "system",
      subtype: "init",
      session_id: "session-dummy",
      slash_commands: ["clear"],
    }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      {
        kind: "session-info",
        sessionId: "session-dummy",
        model: undefined,
        permissionMode: undefined,
        slashCommands: ["clear"],
        terminalSlashCommands: [],
      },
    ])
  })

  it("conversation_reset を conversation-cleared にする（/clear の合図。2026-09-15 実測）", () => {
    const message = {
      type: "conversation_reset",
      new_conversation_id: "conversation-dummy",
      uuid: "uuid-dummy",
      session_id: "session-dummy",
    }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([{ kind: "conversation-cleared" }])
  })

  it("/compact で届くもの（system の status）からは何も起こさない（会話は消えていない）", () => {
    const status = {
      type: "system",
      subtype: "status",
      status: "compacting",
      session_id: "session-dummy",
    }

    expect(toSessionEvents(status, EXPRESSIONS)).toEqual([])
  })

  it("system の compact_boundary を compact-boundary にする（数値は運ばない）", () => {
    const message = {
      type: "system",
      subtype: "compact_boundary",
      compact_metadata: { trigger: "auto", pre_tokens: 29_998, post_tokens: 3_844 },
    }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([{ kind: "compact-boundary" }])
  })

  describe("背景のタスク（実測で届いた順: background_tasks_changed → task_started → … → background_tasks_changed → task_updated → task_notification）", () => {
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

    it("task_started / task_progress / task_updated / task_notification はイベントにしない（顔ぶれは background_tasks_changed だけで分かる）", () => {
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
        {
          type: "system",
          subtype: "task_notification",
          task_id: "bash-1",
          tool_use_id: "toolu_1",
          status: "completed",
          output_file: "/tmp/dummy/output",
          summary: "架空の要約",
        },
      ]

      expect(edges.flatMap((message) => toSessionEvents(message, EXPRESSIONS))).toEqual([])
    })

    it("知らせのあとの続きのターンの result（origin が task-notification）も turn-finished にする", () => {
      const message = {
        type: "result",
        subtype: "success",
        parent_tool_use_id: null,
        origin: { kind: "task-notification" },
      }

      expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
        { kind: "turn-finished", status: "success" },
      ])
    })
  })

  it("init・commands_changed・compact_boundary・background_tasks_changed 以外の system は無視する", () => {
    expect(toSessionEvents({ type: "system", subtype: "架空の未知の種別" }, EXPRESSIONS)).toEqual(
      [],
    )
  })

  it("system の commands_changed からコマンドの説明を取り出す", () => {
    const message = {
      type: "system",
      subtype: "commands_changed",
      commands: [
        { name: "clear", description: "会話をリセットする", argumentHint: "" },
        { name: "next-task", description: "次のタスクを1件進める", argumentHint: "" },
      ],
    }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      {
        kind: "command-descriptions",
        descriptions: [
          { name: "clear", description: "会話をリセットする" },
          { name: "next-task", description: "次のタスクを1件進める" },
        ],
      },
    ])
  })

  it("result の success はターンの成功にする", () => {
    const message = { type: "result", subtype: "success", num_turns: 1, duration_ms: 10 }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      { kind: "turn-finished", status: "success" },
    ])
  })

  // 中断されたターンはこの subtype で終わる（実測）。
  it("result の error_during_execution はターンの失敗にする", () => {
    const message = { type: "result", subtype: "error_during_execution" }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      { kind: "turn-finished", status: "error" },
    ])
  })

  // ステップごとの使用量。**ターンの中を持ち場ごとに割れるのはこの経路だけ**なので、
  // `message.id` と持ち場が付いて出ることを固定する。
  it("assistant の usage を message.id 付きのステップの使用量にする", () => {
    const message = {
      ...assistantMessage([{ type: "text", text: "ダミーの本文です。" }]),
      message: {
        role: "assistant",
        id: "msg_fictional_1",
        content: [{ type: "text", text: "ダミーの本文です。" }],
        usage: {
          input_tokens: 43_145,
          output_tokens: 13_371,
          cache_read_input_tokens: 9_000,
          cache_creation_input_tokens: 800,
        },
      },
    }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      { kind: "utterance", text: "ダミーの本文です。" },
      {
        kind: "step-usage",
        messageId: "msg_fictional_1",
        scope: "main",
        usage: {
          inputTokens: 43_145,
          outputTokens: 13_371,
          cacheReadInputTokens: 9_000,
          cacheCreationInputTokens: 800,
        },
      },
    ])
  })

  it("parent_tool_use_id のある assistant のステップはサブエージェントぶんになる", () => {
    const message = {
      type: "assistant",
      session_id: "s-1",
      parent_tool_use_id: "toolu_sub_1",
      message: {
        role: "assistant",
        id: "msg_fictional_2",
        content: [],
        // 欠けた鍵と `null`（`cache_creation_input_tokens` は null で来ることがある）は0に倒す。
        usage: { input_tokens: 55_431, cache_creation_input_tokens: null },
      },
    }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      {
        kind: "step-usage",
        messageId: "msg_fictional_2",
        scope: "subagent",
        usage: {
          inputTokens: 55_431,
          outputTokens: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        },
      },
    ])
  })

  it("id や usage を持たない assistant はステップの使用量を出さない", () => {
    const withoutUsage = {
      ...assistantMessage([]),
      message: { role: "assistant", id: "msg_fictional_3", content: [] },
    }
    const withoutId = {
      ...assistantMessage([]),
      message: { role: "assistant", content: [], usage: { input_tokens: 10 } },
    }

    expect(toSessionEvents(withoutUsage, EXPRESSIONS)).toEqual([])
    expect(toSessionEvents(withoutId, EXPRESSIONS)).toEqual([])
  })

  // トークン消費の記録（`docs/requirements.md` 4.1）。**運ぶのは累計そのまま**で、増分に直すのは
  // `src/server/core/token-usage.ts`。
  it("result の modelUsage は累計のイベントにして、ターンの終わりの前に並べる", () => {
    const message = {
      type: "result",
      subtype: "success",
      // メインループぶんだけの `usage` は集計に使わないので、混ざらないことも一緒に見る。
      usage: { input_tokens: 1, output_tokens: 2 },
      total_cost_usd: 0.5,
      modelUsage: {
        "claude-opus-fictional": {
          inputTokens: 1_200,
          outputTokens: 340,
          thinkingTokens: 50,
          cacheReadInputTokens: 9_000,
          cacheCreationInputTokens: 800,
          costUSD: 0.125,
          contextWindow: 200_000,
        },
      },
    }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      {
        kind: "token-usage",
        cumulative: [
          {
            model: "claude-opus-fictional",
            inputTokens: 1_200,
            outputTokens: 340,
            thinkingTokens: 50,
            cacheReadInputTokens: 9_000,
            cacheCreationInputTokens: 800,
            costUsd: 0.125,
          },
        ],
      },
      { kind: "turn-finished", status: "success" },
    ])
  })

  it("modelUsage の欠けた鍵・数でない値は0に倒す", () => {
    const message = {
      type: "result",
      subtype: "success",
      modelUsage: { "claude-opus-fictional": { inputTokens: "たくさん", outputTokens: 7 } },
    }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      {
        kind: "token-usage",
        cumulative: [
          {
            model: "claude-opus-fictional",
            inputTokens: 0,
            outputTokens: 7,
            thinkingTokens: 0,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            costUsd: 0,
          },
        ],
      },
      { kind: "turn-finished", status: "success" },
    ])
  })

  it("modelUsage が無い・空・壊れている result は使用量のイベントを出さない", () => {
    for (const modelUsage of [undefined, {}, "こわれた", { "claude-opus-fictional": null }]) {
      expect(
        toSessionEvents({ type: "result", subtype: "success", modelUsage }, EXPRESSIONS),
      ).toEqual([{ kind: "turn-finished", status: "success" }])
    }
  })

  it("parent_tool_use_id のある result は使用量も出さない（サブエージェントぶんは本体の累計に含まれる）", () => {
    const message = {
      type: "result",
      subtype: "success",
      parent_tool_use_id: "toolu_sub_1",
      modelUsage: { "claude-sonnet-fictional": { inputTokens: 10, outputTokens: 2 } },
    }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([])
  })

  it("parent_tool_use_id のある result はターンの終わりにしない（案4-c）", () => {
    const message = {
      type: "result",
      subtype: "success",
      num_turns: 1,
      duration_ms: 10,
      parent_tool_use_id: "toolu_sub_1",
    }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([])
  })

  it("parent_tool_use_id が null の result は今までどおりターンの終わりにする", () => {
    const message = {
      type: "result",
      subtype: "success",
      num_turns: 1,
      duration_ms: 10,
      parent_tool_use_id: null,
    }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      { kind: "turn-finished", status: "success" },
    ])
  })

  it("知らない種別は無視する（種別は本体の更新で増える）", () => {
    expect(toSessionEvents({ type: "some_future_message", payload: {} }, EXPRESSIONS)).toEqual([])
  })

  it("メッセージの形が壊れていても落ちない", () => {
    expect(toSessionEvents(undefined, EXPRESSIONS)).toEqual([])
    expect(toSessionEvents("文字列", EXPRESSIONS)).toEqual([])
    expect(toSessionEvents({ type: 1 }, EXPRESSIONS)).toEqual([])
    expect(toSessionEvents({ type: "assistant" }, EXPRESSIONS)).toEqual([])
    expect(
      toSessionEvents({ type: "assistant", message: { content: "文字列" } }, EXPRESSIONS),
    ).toEqual([])
    expect(toSessionEvents({ type: "system", subtype: "init" }, EXPRESSIONS)).toEqual([])
  })
})

describe("toCommandDescriptions", () => {
  it("名前と説明の組にする", () => {
    expect(
      toCommandDescriptions([{ name: "clear", description: "会話をリセットする", aliases: [] }]),
    ).toEqual([{ name: "clear", description: "会話をリセットする" }])
  })

  it("説明が空文字・文字列でないものは説明なし（undefined）にする", () => {
    expect(
      toCommandDescriptions([
        { name: "model", description: "" },
        { name: "compact", description: 7 },
        { name: "usage" },
      ]),
    ).toEqual([
      { name: "model", description: undefined },
      { name: "compact", description: undefined },
      { name: "usage", description: undefined },
    ])
  })

  it("名前が無い・空の要素は捨てる", () => {
    expect(toCommandDescriptions([{ description: "名無し" }, { name: "" }, "clear", null])).toEqual(
      [],
    )
  })

  it("配列でない値は空配列にする", () => {
    expect(toCommandDescriptions(undefined)).toEqual([])
    expect(toCommandDescriptions({ commands: [] })).toEqual([])
  })
})

describe("toPlan", () => {
  it("subscriptionType をそのまま返す（知らない値でも直さず出す）", () => {
    expect(toPlan({ subscriptionType: "max" })).toBe("max")
    expect(toPlan({ subscriptionType: "未来の値" })).toBe("未来の値")
  })

  it("email / organization は戻り値に出ない", () => {
    const plan = toPlan({
      subscriptionType: "max",
      email: "架空@example.com",
      organization: "架空組織",
    })

    expect(plan).toBe("max")
  })

  it("subscriptionType が無い・空文字・文字列でないときは undefined", () => {
    expect(toPlan({})).toBeUndefined()
    expect(toPlan({ subscriptionType: "" })).toBeUndefined()
    expect(toPlan({ subscriptionType: 7 })).toBeUndefined()
  })

  it("API キー・Bedrock のときのような、他のフィールドしか無い形でも undefined", () => {
    expect(toPlan({ apiProvider: "bedrock", tokenSource: "aws" })).toBeUndefined()
  })

  it("オブジェクトでない値は undefined にする", () => {
    expect(toPlan(undefined)).toBeUndefined()
    expect(toPlan(null)).toBeUndefined()
    expect(toPlan("max")).toBeUndefined()
  })
})

describe("toSessionEvents（report ツール）", () => {
  const REPORT_TOOL_FULL_NAME = `mcp__${TSUKUMO_MCP_SERVER_NAME}__${REPORT_TOOL_NAME}`

  it("メインの report の呼び出しはレポートにする（ツールの開始にはしない）", () => {
    const message = assistantMessage([
      {
        type: "tool_use",
        id: "toolu_r1",
        name: REPORT_TOOL_FULL_NAME,
        input: { conclusion: "架空の結論。", body: "## 架空の見出し", favor: "架空のお願い" },
      },
    ])

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      {
        kind: "report",
        toolUseId: "toolu_r1",
        conclusion: "架空の結論。",
        body: "## 架空の見出し",
        favor: "架空のお願い",
      },
    ])
  })

  it("body と favor が無いときは空の文字列に畳む", () => {
    const message = assistantMessage([
      {
        type: "tool_use",
        id: "toolu_r1",
        name: REPORT_TOOL_FULL_NAME,
        input: { conclusion: "架空の結論。" },
      },
    ])

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      { kind: "report", toolUseId: "toolu_r1", conclusion: "架空の結論。", body: "", favor: "" },
    ])
  })

  it("サブエージェントの report の呼び出しは捨てる（レポートにもツールの開始にもしない）", () => {
    const message = assistantMessage(
      [
        {
          type: "tool_use",
          id: "toolu_r1",
          name: REPORT_TOOL_FULL_NAME,
          input: { conclusion: "架空の結論。" },
        },
      ],
      "toolu_agent",
    )

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([])
  })

  it("conclusion が文字列でない report は捨てる", () => {
    const message = assistantMessage([
      {
        type: "tool_use",
        id: "toolu_r1",
        name: REPORT_TOOL_FULL_NAME,
        input: { body: "架空の本文" },
      },
    ])

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([])
  })

  /** `report` などの呼び出しの塊が開いた断片（`includePartialMessages`）。 */
  function toolUseStarted(name: string, parentToolUseId: string | null) {
    return {
      type: "stream_event",
      parent_tool_use_id: parentToolUseId,
      event: {
        type: "content_block_start",
        index: 1,
        content_block: { type: "tool_use", id: "toolu_r1", name, input: {} },
      },
    }
  }

  it("メインの report の呼び出しの塊が開いたら、書き始めた合図にする（立ち絵の「書いている」）", () => {
    expect(toSessionEvents(toolUseStarted(REPORT_TOOL_FULL_NAME, null), EXPRESSIONS)).toEqual([
      { kind: "report-drafting", toolUseId: "toolu_r1" },
    ])
  })

  it("サブエージェントの report や、ほかのツールの塊が開いても合図にしない", () => {
    expect(
      toSessionEvents(toolUseStarted(REPORT_TOOL_FULL_NAME, "toolu_agent"), EXPRESSIONS),
    ).toEqual([])
    expect(toSessionEvents(toolUseStarted("Read", null), EXPRESSIONS)).toEqual([])
  })

  it("report の引数の断片（input_json_delta）は運ばない", () => {
    const delta = {
      type: "stream_event",
      parent_tool_use_id: null,
      event: {
        type: "content_block_delta",
        index: 1,
        delta: { type: "input_json_delta", partial_json: '{"conclusion":"架空' },
      },
    }

    expect(toSessionEvents(delta, EXPRESSIONS)).toEqual([])
  })
})

describe("isSubagentMessage", () => {
  it("parent_tool_use_id が文字列のものだけをサブエージェントの中のメッセージとする", () => {
    expect(isSubagentMessage({ type: "assistant", parent_tool_use_id: "toolu_fake" })).toBe(true)
    expect(isSubagentMessage({ type: "assistant", parent_tool_use_id: null })).toBe(false)
    expect(isSubagentMessage({ type: "system", subtype: "init" })).toBe(false)
    expect(isSubagentMessage("壊れた形")).toBe(false)
  })
})
