import { describe, expect, it } from "vitest"

import {
  isSubagentMessage,
  toSessionEvents,
} from "../../../../src/server/session-driver/core/sdk-message.ts"
import { assistantMessage, EXPRESSIONS } from "../../../fixture/sdk-assistant-message.ts"
import { WORK_PLAN_TOOL_FULL_NAME } from "../../../fixture/sdk-message.ts"

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

  it("サブエージェントの中のテキストは本文にしない（委譲先の独り言をメインビューに出さない）", () => {
    const message = assistantMessage(
      [{ type: "text", text: "Dummy progress note." }],
      "toolu_sub_1",
    )

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([])
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

  it.each([
    ["command が model 以外", { command: "clear", args: "" }],
    ["args が無い", { command: "model" }],
    ["引数なしの /model（args が空白）", { command: "model", args: " " }],
  ])("local_command_run は %s のとき何も出さない", (_name, localCommandRun) => {
    const message = { ...assistantMessage([]), local_command_run: localCommandRun }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([])
  })

  it("メインの work_plan の呼び出しは、呼び出しの id を付けたワークプランにする（ツールの開始にはしない）", () => {
    const message = assistantMessage([
      {
        type: "tool_use",
        id: "toolu_3",
        name: WORK_PLAN_TOOL_FULL_NAME,
        input: { phases: ["架空の段A", "架空の段B"], current: 1, phaseSummary: "架空のまとめ。" },
      },
    ])

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      {
        kind: "work-plan-called",
        toolUseId: "toolu_3",
        plan: {
          phases: ["架空の段A", "架空の段B"],
          current: 1,
          finishedInGroup: [],
          phaseSummary: "架空のまとめ。",
          delegatedRange: { kind: "none" },
          skippedPhases: [],
          awaitingSummary: { kind: "none" },
        },
      },
    ])
  })

  it("phases の無い work_plan はワークプランにしない", () => {
    const message = assistantMessage([
      {
        type: "tool_use",
        id: "toolu_3",
        name: WORK_PLAN_TOOL_FULL_NAME,
        input: { current: 1, phaseSummary: "架空のまとめ。" },
      },
    ])

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([])
  })

  it("段が途中の位置で段のまとめの無い work_plan もワークプランにする（まとめの要否は WorkPlanReview が決める）", () => {
    const message = assistantMessage([
      {
        type: "tool_use",
        id: "toolu_3",
        name: WORK_PLAN_TOOL_FULL_NAME,
        input: { phases: ["架空の段A", "架空の段B"], current: 1 },
      },
    ])

    expect(toSessionEvents(message, EXPRESSIONS)).toMatchObject([
      { kind: "work-plan-called", plan: { current: 1, phaseSummary: "" } },
    ])
  })

  it("サブエージェントの中の work_plan と、位置が段の数を超えた work_plan は捨てる", () => {
    const block = {
      type: "tool_use",
      id: "toolu_3",
      name: WORK_PLAN_TOOL_FULL_NAME,
      input: { phases: ["架空の段A", "架空の段B"], current: 0 },
    }
    const overflow = { ...block, input: { phases: ["架空の段A", "架空の段B"], current: 3 } }

    expect(toSessionEvents(assistantMessage([block], "toolu_sub_1"), EXPRESSIONS)).toEqual([])
    expect(toSessionEvents(assistantMessage([overflow]), EXPRESSIONS)).toEqual([])
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
      skills: ["tsukumo-workflow:next-task", 7],
      agents: ["tsukumo-workflow:acceptor", "fable-acceptor"],
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
        skillNames: ["tsukumo-workflow:next-task"],
        agentNames: ["tsukumo-workflow:acceptor", "fable-acceptor"],
      },
      { kind: "setting-confirmed", setting: "model", value: "claude-opus-5" },
      { kind: "setting-confirmed", setting: "permissionMode", value: "auto" },
    ])
  })

  it("メインの assistant の message.model を見届けたモデルにし、サブエージェントのものは出さない", () => {
    const main = {
      type: "assistant",
      message: { model: "claude-opus-5", content: [] },
    }
    const sub = { ...main, parent_tool_use_id: "toolu_1" }

    expect(toSessionEvents(main, EXPRESSIONS)).toContainEqual({
      kind: "setting-confirmed",
      setting: "model",
      value: "claude-opus-5",
    })
    expect(
      toSessionEvents(sub, EXPRESSIONS).filter((event) => event.kind === "setting-confirmed"),
    ).toEqual([])
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
        skillNames: [],
        agentNames: [],
      },
    ])
  })

  it("init に agents が無いときはエージェントの名前を空配列にする", () => {
    const message = {
      type: "system",
      subtype: "init",
      session_id: "session-dummy",
      skills: ["fable-review"],
    }

    expect(toSessionEvents(message, EXPRESSIONS)).toContainEqual(
      expect.objectContaining({
        kind: "session-info",
        skillNames: ["fable-review"],
        agentNames: [],
      }),
    )
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
    const message = {
      type: "result",
      subtype: "success",
      num_turns: 1,
      duration_ms: 10,
      parent_tool_use_id: null,
    }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      { kind: "turn-finished", outcome: { kind: "completed" } },
    ])
  })

  it("result の error_during_execution は、理由が無くても中断を送ったターンなら中断にする", () => {
    const message = { type: "result", subtype: "error_during_execution" }

    expect(toSessionEvents(message, EXPRESSIONS, true)).toEqual([
      { kind: "turn-finished", outcome: { kind: "interrupted" } },
    ])
  })

  it("result の error_during_execution は、理由が無く中断を送っていないなら失敗にする", () => {
    const message = { type: "result", subtype: "error_during_execution" }

    expect(toSessionEvents(message, EXPRESSIONS, false)).toEqual([
      { kind: "turn-finished", outcome: { kind: "failed", cause: { kind: "execution-error" } } },
    ])
  })

  it("result の error_during_execution は、中断の terminal_reason なら送ったかによらず中断にする", () => {
    const messages = [
      { type: "result", subtype: "error_during_execution", terminal_reason: "aborted_streaming" },
      { type: "result", subtype: "error_during_execution", terminal_reason: "aborted_tools" },
    ]

    for (const interruptSent of [true, false]) {
      expect(
        messages.flatMap((message) => toSessionEvents(message, EXPRESSIONS, interruptSent)),
      ).toEqual([
        { kind: "turn-finished", outcome: { kind: "interrupted" } },
        { kind: "turn-finished", outcome: { kind: "interrupted" } },
      ])
    }
  })

  it("知らない種別は無視する（種別は Claude Code の更新で増える）", () => {
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

describe("isSubagentMessage", () => {
  it("parent_tool_use_id が文字列のものだけをサブエージェントの中のメッセージとする", () => {
    expect(isSubagentMessage({ type: "assistant", parent_tool_use_id: "toolu_fake" })).toBe(true)
    expect(isSubagentMessage({ type: "assistant", parent_tool_use_id: null })).toBe(false)
    expect(isSubagentMessage({ type: "system", subtype: "init" })).toBe(false)
    expect(isSubagentMessage("壊れた形")).toBe(false)
  })
})

describe("toSessionEvents（委譲の返却）", () => {
  function toolUse(
    name: string,
    input: unknown,
    parentToolUseId?: string,
  ): Record<string, unknown> {
    return assistantMessage([{ type: "tool_use", id: "toolu_back", name, input }], parentToolUseId)
  }

  it("委譲先の SubagentHandback は、本文が何であっても委譲先を見分ける鍵の delegate-handed-back だけを出す", () => {
    const events = [
      { message: "段 1/3 | 架空の進み。\n架空の続き" },
      { message: "了解" },
      { message: 1 },
    ].map((input) =>
      toSessionEvents(toolUse("SubagentHandback", input, "toolu_sub_1"), EXPRESSIONS),
    )

    expect(events).toEqual(
      Array.from({ length: 3 }, () => [{ kind: "delegate-handed-back", delegate: "toolu_sub_1" }]),
    )
  })

  it("委譲先の形の合う phase_result は、委譲先を見分ける鍵の phase-result-called だけを出す", () => {
    const name = "mcp__tsukumo__phase_result"

    expect(
      toSessionEvents(
        toolUse(name, { phase: 1, count: 2, outcome: "finished" }, "toolu_sub_1"),
        EXPRESSIONS,
      ),
    ).toEqual([{ kind: "phase-result-called", delegate: "toolu_sub_1" }])
    expect(
      toSessionEvents(
        toolUse(name, { phase: 3, count: 2, outcome: "finished" }, "toolu_sub_1"),
        EXPRESSIONS,
      ),
    ).toEqual([])
    expect(
      toSessionEvents(toolUse(name, { phase: 1, count: 2, outcome: "finished" }), EXPRESSIONS),
    ).toEqual([])
  })

  describe("委譲先の返却", () => {
    it("メイン自身の SubagentHandback は返却にしない", () => {
      const message = assistantMessage([
        { type: "tool_use", id: "t3", name: "SubagentHandback", input: { message: "段 1/2 | x" } },
      ])

      expect(toSessionEvents(message, EXPRESSIONS).map((event) => event.kind)).toEqual([
        "tool-started",
      ])
    })
  })
})
