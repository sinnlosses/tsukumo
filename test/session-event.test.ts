import { describe, expect, it } from "bun:test"

import { type Expression } from "../src/expression.ts"
import { SPEAK_MCP_SERVER_NAME, SPEAK_TOOL_NAME, toSessionEvents } from "../src/session-event.ts"

// フィクスチャはすべて手で書いた架空のやり取り。**実物の会話は使わない**
// （docs/coding-standards.md「会話内容の扱い」）。
const EXPRESSIONS: readonly Expression[] = ["default", "working", "proud"]

const SPEAK_TOOL_FULL_NAME = `mcp__${SPEAK_MCP_SERVER_NAME}__${SPEAK_TOOL_NAME}`

function assistantMessage(content: readonly unknown[], parentToolUseId?: string): unknown {
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

  it("init 以外の system は無視する", () => {
    expect(toSessionEvents({ type: "system", subtype: "compact_boundary" }, EXPRESSIONS)).toEqual(
      [],
    )
  })

  it("result の success はターンの成功にする", () => {
    const message = { type: "result", subtype: "success", num_turns: 1, duration_ms: 10 }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      { kind: "turn-finished", status: "success" },
    ])
  })

  // 中断されたターンはこの subtype で終わる（2026-09-11 実測）。
  it("result の error_during_execution はターンの失敗にする", () => {
    const message = { type: "result", subtype: "error_during_execution" }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      { kind: "turn-finished", status: "error" },
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
