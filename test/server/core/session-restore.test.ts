import { describe, expect, it } from "bun:test"

import { sessionTag, sessionTagFamily } from "../../../src/server/core/config.ts"
import { DEFAULT_VIEW_PORT } from "../../../src/server/core/port-resolution.ts"
import { TSUKUMO_MCP_SERVER_NAME, SPEAK_TOOL_NAME } from "../../../src/server/core/sdk-message.ts"
import {
  listMarkedSessions,
  selectSessionToResume,
  toRestoredEvents,
} from "../../../src/server/core/session-restore.ts"
import { type Expression } from "../../../src/shared/expression.ts"
import { MAX_SESSION_CHOICES } from "../../../src/shared/session-choice.ts"

// フィクスチャはすべて手で書いた架空のやり取り。**実物の transcript は使わない**
// （docs/coding-standards.md「会話内容の扱い」）。本物の claude も起こさない
// （`listSessions` / `getSessionMessages` を呼ぶのは src/server/adapter/sdk-driver.ts の側）。
const EXPRESSIONS: readonly Expression[] = ["default", "thinking", "proud"]

// 印はキャラクターパックごと・雑談かどうか・ビューのポートごとに違う
// （`tsukumo:<パック名>@7327` と `tsukumo:<パック名>:chat@7327`。目印はポート番号そのもの）。
const TAG = sessionTag("架空のパック", false, DEFAULT_VIEW_PORT)
const CHAT_TAG = sessionTag("架空のパック", true, DEFAULT_VIEW_PORT)
const OTHER_PACK_TAG = sessionTag("別の架空のパック", false, DEFAULT_VIEW_PORT)
// 2つめの tsukumo（ポートが1つずれたぶん、目印も 7328 になる）。
const SECOND_TAG = sessionTag("架空のパック", false, DEFAULT_VIEW_PORT + 1)
// 一覧を絞る鍵（目印を外した印）。同じパック・同じモードのものだけが残る。
const FAMILY = sessionTagFamily("架空のパック", false)
const CHAT_FAMILY = sessionTagFamily("架空のパック", true)

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
      selectSessionToResume(
        sessions,
        sessionTag("まだ起こしていないパック", false, DEFAULT_VIEW_PORT),
      ),
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

  it("目印の違うセッションは選ばない（同じディレクトリの2つめの tsukumo）", () => {
    const sessions = [
      sessionInfo({ sessionId: "s-first", lastModified: 900, tag: TAG }),
      sessionInfo({ sessionId: "s-second", lastModified: 100, tag: SECOND_TAG }),
    ]

    expect(selectSessionToResume(sessions, TAG)).toBe("s-first")
    expect(selectSessionToResume(sessions, SECOND_TAG)).toBe("s-second")
  })

  it("目印の無い昔の印は、既定のポートの続きとして選ぶ（互換）", () => {
    const sessions = [
      sessionInfo({ sessionId: "s-legacy", lastModified: 900, tag: "tsukumo:架空のパック" }),
      sessionInfo({
        sessionId: "s-legacy-chat",
        lastModified: 800,
        tag: "tsukumo:架空のパック:chat",
      }),
    ]

    expect(selectSessionToResume(sessions, TAG)).toBe("s-legacy")
    expect(selectSessionToResume(sessions, CHAT_TAG)).toBe("s-legacy-chat")
    expect(selectSessionToResume(sessions, SECOND_TAG)).toBeUndefined()
  })

  // かつて目印は1文字だった（`A` が既定のポート、+1 ごとに次の文字）。
  // いま動いている tsukumo が拾えなくならないよう、元のポートへ戻して選ぶ。
  it("1文字だった昔の目印は、元のポートの続きとして選ぶ（互換）", () => {
    const sessions = [
      sessionInfo({ sessionId: "s-legacy-a", lastModified: 900, tag: "tsukumo:架空のパック@A" }),
      sessionInfo({ sessionId: "s-legacy-b", lastModified: 800, tag: "tsukumo:架空のパック@B" }),
      sessionInfo({
        sessionId: "s-legacy-chat-a",
        lastModified: 700,
        tag: "tsukumo:架空のパック:chat@A",
      }),
    ]

    expect(selectSessionToResume(sessions, TAG)).toBe("s-legacy-a")
    expect(selectSessionToResume(sessions, SECOND_TAG)).toBe("s-legacy-b")
    expect(selectSessionToResume(sessions, CHAT_TAG)).toBe("s-legacy-chat-a")
  })
})

describe("listMarkedSessions", () => {
  it("同じ一族のセッションを、目印つきで新しい順に並べる", () => {
    const sessions = [
      sessionInfo({ sessionId: "s-first", lastModified: 100, tag: TAG }),
      sessionInfo({ sessionId: "s-second", lastModified: 300, tag: SECOND_TAG }),
      sessionInfo({ sessionId: "s-third", lastModified: 200, tag: TAG }),
    ]

    expect(listMarkedSessions(sessions, FAMILY)).toEqual([
      { viewPort: DEFAULT_VIEW_PORT + 1, sessionId: "s-second", lastModified: 300 },
      { viewPort: DEFAULT_VIEW_PORT, sessionId: "s-third", lastModified: 200 },
      { viewPort: DEFAULT_VIEW_PORT, sessionId: "s-first", lastModified: 100 },
    ])
  })

  // 一覧から選んでも、キャラクターも雑談かどうかも変わらない（`switch-session`）。
  // 別のパック・別のモードのセッションが混ざると、選んだ瞬間に相手だけが入れ替わる。
  it("別のパック・別のモードのセッションは落とす", () => {
    const sessions = [
      sessionInfo({ sessionId: "s-work", lastModified: 100, tag: TAG }),
      sessionInfo({ sessionId: "s-chat", lastModified: 300, tag: CHAT_TAG }),
      sessionInfo({ sessionId: "s-other-pack", lastModified: 400, tag: OTHER_PACK_TAG }),
    ]

    expect(listMarkedSessions(sessions, FAMILY)).toEqual([
      { viewPort: DEFAULT_VIEW_PORT, sessionId: "s-work", lastModified: 100 },
    ])
    expect(listMarkedSessions(sessions, CHAT_FAMILY)).toEqual([
      { viewPort: DEFAULT_VIEW_PORT, sessionId: "s-chat", lastModified: 300 },
    ])
  })

  it("印の無いセッションと壊れた要素は落とす（昔の印は既定のポートとして残す）", () => {
    const sessions = [
      null,
      sessionInfo({ sessionId: "s-bare", lastModified: 900 }),
      sessionInfo({ sessionId: "s-other-tool", lastModified: 800, tag: "別の道具" }),
      sessionInfo({ sessionId: "s-broken", lastModified: "きのう", tag: TAG }),
      sessionInfo({ sessionId: "s-legacy", lastModified: 500, tag: "tsukumo:架空のパック" }),
    ]

    expect(listMarkedSessions(sessions, FAMILY)).toEqual([
      { viewPort: DEFAULT_VIEW_PORT, sessionId: "s-legacy", lastModified: 500 },
    ])
  })

  // 印は使うほど増え続ける（実測: このリポジトリで120件）。`<select>` に全部は並べない。
  it("新しいほうから上限の件数までしか返さない", () => {
    const many = Array.from({ length: MAX_SESSION_CHOICES + 5 }, (_unused, index) =>
      sessionInfo({ sessionId: `s-${String(index)}`, lastModified: index, tag: TAG }),
    )

    const listed = listMarkedSessions(many, FAMILY)
    expect(listed).toHaveLength(MAX_SESSION_CHOICES)
    expect(listed[0]?.sessionId).toBe(`s-${String(MAX_SESSION_CHOICES + 4)}`)
  })

  it("一覧が空・形が壊れているときは空（落ちない）", () => {
    expect(listMarkedSessions([], FAMILY)).toEqual([])
    expect(listMarkedSessions(undefined, FAMILY)).toEqual([])
    expect(listMarkedSessions({ sessions: [] }, FAMILY)).toEqual([])
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

  it("仕掛けが差し込んだ塊だけの user メッセージは依頼として起こさない", () => {
    const messages = [
      userMessage("<task-notification>\n<task-id>架空のID</task-id>\n</task-notification>"),
      userMessage("<local-command-caveat>架空の断り書き</local-command-caveat>"),
      userMessage('<agent-message from="架空のエージェント">架空の伝言</agent-message>'),
      userMessage([{ type: "text", text: "架空の依頼" }]),
    ]

    expect(toRestoredEvents(messages, EXPRESSIONS)).toEqual([
      { kind: "request", text: "架空の依頼", images: [] },
      { kind: "turn-finished", status: "success" },
    ])
  })

  it("利用者の文面に混じった塊は、その塊だけ落として前後を残す", () => {
    const messages = [
      userMessage(
        "架空の依頼の前半\n<system-reminder>架空の差し込み</system-reminder>\n架空の依頼の後半",
      ),
    ]

    expect(toRestoredEvents(messages, EXPRESSIONS)).toEqual([
      { kind: "request", text: "架空の依頼の前半\n\n架空の依頼の後半", images: [] },
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

  // 圧縮（`/compact`）が起きると transcript の鎖が切れ、`includeSystemMessages: true` で読んだ
  // 並びは区切りの行から始まる（`src/server/adapter/sdk-driver.ts` の `readRestoredEvents`。
  // 実測）。**起こし直したあとに区切りがログのいちばん上に来る**ことをここで示す。
  it("圧縮の区切り（system の compact_boundary）が並びの先頭に来る", () => {
    const messages = [
      { type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "auto" } },
      userMessage([{ type: "text", text: "架空の依頼" }]),
      assistantMessage([{ type: "text", text: "架空の本文" }]),
    ]

    expect(toRestoredEvents(messages, EXPRESSIONS)).toEqual([
      { kind: "compact-boundary" },
      { kind: "request", text: "架空の依頼", images: [] },
      { kind: "utterance", text: "架空の本文" },
      { kind: "turn-finished", status: "success" },
    ])
  })

  it("知らない system メッセージが混ざっても落ちない（読めたものだけ残る）", () => {
    const messages = [
      { type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "manual" } },
      { type: "system", subtype: "架空の未知の通知", text: "架空のお知らせ" },
      userMessage([{ type: "text", text: "架空の依頼" }]),
    ]

    expect(toRestoredEvents(messages, EXPRESSIONS)).toEqual([
      { kind: "compact-boundary" },
      { kind: "request", text: "架空の依頼", images: [] },
      { kind: "turn-finished", status: "success" },
    ])
  })
})
