import { describe, expect, it } from "bun:test"

import { sessionTag } from "../../../src/server/core/config.ts"
import { TSUKUMO_MCP_SERVER_NAME, SPEAK_TOOL_NAME } from "../../../src/server/core/sdk-message.ts"
import {
  selectSessionToResume,
  toRestoredEvents,
} from "../../../src/server/core/session-restore.ts"
import { type Expression } from "../../../src/shared/expression.ts"

// フィクスチャはすべて手で書いた架空のやり取り。**実物の transcript は使わない**
// （docs/coding-standards.md「会話内容の扱い」）。本物の claude も起こさない
// （`listSessions` / `getSessionMessages` を呼ぶのは src/server/adapter/sdk-driver.ts の側）。
const EXPRESSIONS: readonly Expression[] = ["default", "thinking", "proud"]

// 印はキャラクターパックごと・雑談かどうかで違う（`tsukumo:<パック名>` と
// `tsukumo:<パック名>:chat`）。
const TAG = sessionTag("架空のパック", false)
const CHAT_TAG = sessionTag("架空のパック", true)
const OTHER_PACK_TAG = sessionTag("別の架空のパック", false)

const SPEAK_TOOL_FULL_NAME = `mcp__${TSUKUMO_MCP_SERVER_NAME}__${SPEAK_TOOL_NAME}`

function sessionInfo(overrides: Readonly<Record<string, unknown>>): unknown {
  return { sessionId: "s-0", summary: "架空のセッション", lastModified: 1_000, ...overrides }
}

function userMessage(content: unknown): unknown {
  return {
    type: "user",
    uuid: "u-1",
    session_id: "s-1",
    message: { role: "user", content },
    parent_tool_use_id: null,
    parent_agent_id: null,
  }
}

function assistantMessage(content: readonly unknown[]): unknown {
  return {
    type: "assistant",
    uuid: "a-1",
    session_id: "s-1",
    message: { role: "assistant", content },
    parent_tool_use_id: null,
    parent_agent_id: null,
  }
}

describe("selectSessionToResume", () => {
  it("印のあるセッションが複数あるとき、lastModified が最新のものを選ぶ", () => {
    const sessions = [
      sessionInfo({ sessionId: "s-old", lastModified: 100, tag: TAG }),
      sessionInfo({ sessionId: "s-new", lastModified: 300, tag: TAG }),
      sessionInfo({ sessionId: "s-mid", lastModified: 200, tag: TAG }),
    ]

    expect(selectSessionToResume(sessions, TAG)).toBe("s-new")
  })

  it("印が無いセッション（同じ cwd の素の claude）は選ばない", () => {
    const sessions = [
      sessionInfo({ sessionId: "s-bare", lastModified: 900 }),
      sessionInfo({ sessionId: "s-other-tag", lastModified: 800, tag: "別の道具" }),
      sessionInfo({ sessionId: "s-tsukumo", lastModified: 100, tag: TAG }),
    ]

    expect(selectSessionToResume(sessions, TAG)).toBe("s-tsukumo")
  })

  it("一覧が空・印が1つも無いときは復元しない（新規に起こす）", () => {
    expect(selectSessionToResume([], TAG)).toBeUndefined()
    expect(
      selectSessionToResume([sessionInfo({ sessionId: "s-bare", lastModified: 900 })], TAG),
    ).toBeUndefined()
  })

  it("別のパックの印を持つセッションは選ばない（キャラクターごとに別のセッション）", () => {
    const sessions = [
      sessionInfo({ sessionId: "s-other-pack", lastModified: 900, tag: OTHER_PACK_TAG }),
      sessionInfo({ sessionId: "s-this-pack", lastModified: 100, tag: TAG }),
    ]

    expect(selectSessionToResume(sessions, TAG)).toBe("s-this-pack")
  })

  it("そのパックの印を持つセッションが無ければ復元しない（新規に起こす）", () => {
    const sessions = [
      sessionInfo({ sessionId: "s-other-pack", lastModified: 900, tag: OTHER_PACK_TAG }),
      sessionInfo({ sessionId: "s-bare", lastModified: 800 }),
    ]

    expect(
      selectSessionToResume(sessions, sessionTag("まだ起こしていないパック", false)),
    ).toBeUndefined()
  })

  it("同じパックでも雑談と仕事で別のセッションを選ぶ（文脈ごと分ける）", () => {
    const sessions = [
      sessionInfo({ sessionId: "s-work", lastModified: 900, tag: TAG }),
      sessionInfo({ sessionId: "s-chat", lastModified: 100, tag: CHAT_TAG }),
    ]

    expect(selectSessionToResume(sessions, TAG)).toBe("s-work")
    expect(selectSessionToResume(sessions, CHAT_TAG)).toBe("s-chat")
  })

  it("仕事のセッションしか無ければ、雑談は新規に起こす（仕事の続きを拾わない）", () => {
    const sessions = [sessionInfo({ sessionId: "s-work", lastModified: 900, tag: TAG })]

    expect(selectSessionToResume(sessions, CHAT_TAG)).toBeUndefined()
  })

  it("形が壊れているときは復元しない（落ちない）", () => {
    expect(selectSessionToResume(undefined, TAG)).toBeUndefined()
    expect(selectSessionToResume({ sessions: [] }, TAG)).toBeUndefined()
    expect(selectSessionToResume([null, 42, "s-1"], TAG)).toBeUndefined()
    expect(
      selectSessionToResume([{ sessionId: 1, lastModified: 100, tag: TAG }], TAG),
    ).toBeUndefined()
    expect(
      selectSessionToResume([{ sessionId: "s-1", lastModified: "きのう", tag: TAG }], TAG),
    ).toBeUndefined()
  })

  it("壊れた要素が混じっていても、読めた印のあるものから選ぶ", () => {
    const sessions = [
      null,
      { sessionId: "s-broken", tag: TAG },
      sessionInfo({ sessionId: "s-ok", lastModified: 500, tag: TAG }),
    ]

    expect(selectSessionToResume(sessions, TAG)).toBe("s-ok")
  })
})

describe("toRestoredEvents", () => {
  it("依頼・本文・セリフ・ツールの行が起き、ターンの境目が依頼ごとに分かれる", () => {
    const messages = [
      userMessage([{ type: "text", text: "架空の依頼その1" }]),
      assistantMessage([
        { type: "text", text: "架空の本文その1" },
        { type: "tool_use", id: "t-1", name: "Read", input: { file_path: "/tmp/dummy.txt" } },
      ]),
      userMessage([{ type: "tool_result", tool_use_id: "t-1", content: "架空の結果" }]),
      assistantMessage([
        {
          type: "tool_use",
          id: "t-2",
          name: SPEAK_TOOL_FULL_NAME,
          input: { text: "できたよ", expression: "proud" },
        },
      ]),
      userMessage("架空の依頼その2"),
      assistantMessage([{ type: "text", text: "架空の本文その2" }]),
    ]

    expect(toRestoredEvents(messages, EXPRESSIONS)).toEqual([
      { kind: "request", text: "架空の依頼その1", images: [] },
      { kind: "utterance", text: "架空の本文その1" },
      {
        kind: "tool-started",
        toolUseId: "t-1",
        name: "Read",
        input: { file_path: "/tmp/dummy.txt" },
        parentToolUseId: undefined,
      },
      { kind: "tool-finished", toolUseId: "t-1", content: "架空の結果", isError: false },
      { kind: "speech", text: "できたよ", expression: "proud" },
      { kind: "turn-finished", status: "success" },
      { kind: "request", text: "架空の依頼その2", images: [] },
      { kind: "utterance", text: "架空の本文その2" },
      { kind: "turn-finished", status: "success" },
    ])
  })

  it("依頼が1つも無い列にはターンの境目を足さない", () => {
    const events = toRestoredEvents(
      [assistantMessage([{ type: "text", text: "架空の本文" }])],
      EXPRESSIONS,
    )

    expect(events).toEqual([{ kind: "utterance", text: "架空の本文" }])
  })

  it("空の列・壊れた要素が混じった列でも落ちず、読めたものだけを返す", () => {
    expect(toRestoredEvents([], EXPRESSIONS)).toEqual([])
    expect(toRestoredEvents(undefined, EXPRESSIONS)).toEqual([])

    const messages = [
      null,
      { type: "user" },
      userMessage([{ type: "text", text: "   " }]),
      userMessage([{ type: "text", text: "架空の依頼" }]),
      { type: "知らない種別" },
      assistantMessage([{ type: "text", text: "架空の本文" }]),
    ]

    expect(toRestoredEvents(messages, EXPRESSIONS)).toEqual([
      { kind: "request", text: "架空の依頼", images: [] },
      { kind: "utterance", text: "架空の本文" },
      { kind: "turn-finished", status: "success" },
    ])
  })

  // SDK が展開したスラッシュコマンドは、入力欄から打ったときの見え方（`/<name>` の1行）に
  // 畳む。**入力は架空のコマンド名で自分で組む**（実物の transcript は使わない）。
  it("引数の無いスラッシュコマンドは `/<name>` の1行に畳む", () => {
    const messages = [
      userMessage(
        "<command-name>/架空コマンド</command-name>\n" +
          "            <command-message>架空コマンド</command-message>\n" +
          "            <command-args></command-args>",
      ),
    ]

    expect(toRestoredEvents(messages, EXPRESSIONS)).toEqual([
      { kind: "request", text: "/架空コマンド", images: [] },
      { kind: "turn-finished", status: "success" },
    ])
  })

  it("引数のあるスラッシュコマンドは `/<name> <args>` に畳む", () => {
    const messages = [
      userMessage(
        "<command-name>/架空コマンド</command-name>\n<command-args>架空の引数</command-args>",
      ),
    ]

    expect(toRestoredEvents(messages, EXPRESSIONS)).toEqual([
      { kind: "request", text: "/架空コマンド 架空の引数", images: [] },
      { kind: "turn-finished", status: "success" },
    ])
  })

  it("タグの無い普通の依頼はそのまま通す", () => {
    const messages = [userMessage([{ type: "text", text: "架空の普通の依頼" }])]

    expect(toRestoredEvents(messages, EXPRESSIONS)).toEqual([
      { kind: "request", text: "架空の普通の依頼", images: [] },
      { kind: "turn-finished", status: "success" },
    ])
  })

  it("`<local-command-stdout>` だけの user メッセージは依頼として起こさない", () => {
    const messages = [
      userMessage("<local-command-stdout>架空の出力</local-command-stdout>"),
      userMessage([{ type: "text", text: "架空の依頼" }]),
      assistantMessage([{ type: "text", text: "架空の本文" }]),
    ]

    expect(toRestoredEvents(messages, EXPRESSIONS)).toEqual([
      { kind: "request", text: "架空の依頼", images: [] },
      { kind: "utterance", text: "架空の本文" },
      { kind: "turn-finished", status: "success" },
    ])
  })
})
