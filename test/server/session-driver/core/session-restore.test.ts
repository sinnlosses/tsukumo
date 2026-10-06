import { describe, expect, it } from "vitest"

import { toRestoredEvents } from "../../../../src/server/session-driver/core/session-restore.ts"
import type { Expression } from "../../../../src/shared/character-pack/expression.ts"
import { mainViewEntries } from "../../../../src/shared/session/main-view.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
} from "../../../../src/shared/session/session-state.ts"
import { reportEvent } from "../../../fixture/report-event.ts"
import {
  assistantMessage,
  REPORT_TOOL_FULL_NAME,
  SPEAK_TOOL_FULL_NAME,
  userMessage,
} from "../../../fixture/sdk-message.ts"

// 本物の claude も起こさない
// （`listSessions` / `getSessionMessages` を呼ぶのは1つの境界に閉じ込めた側だけ。
// docs/architecture.md「1ファイル = 1つの境界」）。
const EXPRESSIONS: readonly Expression[] = ["default", "thinking", "proud"]

/** 再生の終わりの印（`toRestoredEvents` が、組み直せたものがあるときだけ末尾に1つ足す）。 */
const HISTORY_RESTORED: SessionEvent = { kind: "history-restored" }

describe("toRestoredEvents", () => {
  it("組み直せたものがあれば、再生の終わりの印を末尾に1つだけ足す（空なら足さない）", () => {
    const events = toRestoredEvents(
      [userMessage("架空の依頼その1"), userMessage("架空の依頼その2")],
      EXPRESSIONS,
    )

    expect(events.filter((event) => event.kind === "history-restored")).toHaveLength(1)
    expect(events.at(-1)).toEqual(HISTORY_RESTORED)
    expect(toRestoredEvents([null, { type: "user" }], EXPRESSIONS)).toEqual([])
  })

  it("最後のやり取りの「所要」は、再生した時刻ではなく transcript の最後の依頼から最後のメッセージまでになる", () => {
    const stamped = (message: unknown, timestamp: string): unknown =>
      Object.assign({}, message, { timestamp })
    const messages = [
      stamped(userMessage("架空の依頼その1"), "2026-01-02T03:00:00.000Z"),
      stamped(userMessage("架空の依頼その2"), "2026-01-02T03:10:00.000Z"),
      stamped(assistantMessage([{ type: "text", text: "架空の本文" }]), "2026-01-02T03:12:30.000Z"),
    ]

    const state = toRestoredEvents(messages, EXPRESSIONS).reduce(
      (current, event) => applySessionEvent(current, event, 999),
      INITIAL_SESSION_STATE,
    )

    expect(state.turn).toMatchObject({
      kind: "finished",
      startedAt: 1767323400000,
      finishedAt: 1767323550000,
    })
  })

  it("時刻の読めない transcript では、最後のやり取りの時刻を足さない", () => {
    const events = toRestoredEvents([userMessage("架空の依頼")], EXPRESSIONS)

    expect(events.some((event) => event.kind === "restored-turn-span")).toBe(false)
  })

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
      { kind: "turn-finished", outcome: { kind: "completed" } },
      { kind: "request", text: "架空の依頼その2", images: [] },
      { kind: "utterance", text: "架空の本文その2" },
      { kind: "turn-finished", outcome: { kind: "completed" } },
      HISTORY_RESTORED,
    ])
  })

  it("差し戻された report の呼び出しは落とし、通った呼び出しだけを残す", () => {
    const messages = [
      userMessage("架空の依頼"),
      assistantMessage([
        {
          type: "tool_use",
          id: "r-1",
          name: REPORT_TOOL_FULL_NAME,
          input: { conclusion: "架空の一" },
        },
      ]),
      userMessage([
        { type: "tool_result", tool_use_id: "r-1", content: "架空の差し戻し", is_error: true },
      ]),
      assistantMessage([
        {
          type: "tool_use",
          id: "r-2",
          name: REPORT_TOOL_FULL_NAME,
          input: { conclusion: "架空の二" },
        },
      ]),
      userMessage([{ type: "tool_result", tool_use_id: "r-2", content: "ok" }]),
    ]

    const reports = toRestoredEvents(messages, EXPRESSIONS).filter(
      (event) => event.kind === "report",
    )

    expect(reports).toEqual([reportEvent({ toolUseId: "r-2", conclusion: "架空の二" })])
  })

  it("差し戻された speak の呼び出しは落とし、通ったセリフだけを結果の直前に残す", () => {
    const speakCall = (id: string, text: string): unknown =>
      assistantMessage([
        {
          type: "tool_use",
          id,
          name: SPEAK_TOOL_FULL_NAME,
          input: { text, expression: "default" },
        },
      ])
    const messages = [
      userMessage("架空の依頼"),
      speakCall("s-1", "架空の通ったセリフ"),
      userMessage([{ type: "tool_result", tool_use_id: "s-1", content: "ok" }]),
      speakCall("s-2", "架空の差し戻されたセリフ"),
      userMessage([
        { type: "tool_result", tool_use_id: "s-2", content: "架空の差し戻し", is_error: true },
      ]),
    ]

    expect(toRestoredEvents(messages, EXPRESSIONS)).toEqual([
      { kind: "request", text: "架空の依頼", images: [] },
      { kind: "speech", text: "架空の通ったセリフ", expression: "default" },
      { kind: "tool-finished", toolUseId: "s-1", content: "ok", isError: false },
      { kind: "tool-finished", toolUseId: "s-2", content: "架空の差し戻し", isError: true },
      { kind: "turn-finished", outcome: { kind: "completed" } },
      HISTORY_RESTORED,
    ])
  })

  it("通った report の closing だけを、report の後ろのセリフとして組み直す", () => {
    const messages = [
      userMessage("架空の依頼"),
      assistantMessage([
        {
          type: "tool_use",
          id: "r-1",
          name: REPORT_TOOL_FULL_NAME,
          input: {
            conclusion: "架空の一",
            closing: { text: "架空の出ない締め", expression: "default" },
          },
        },
      ]),
      userMessage([
        { type: "tool_result", tool_use_id: "r-1", content: "架空の差し戻し", is_error: true },
      ]),
      assistantMessage([
        {
          type: "tool_use",
          id: "r-2",
          name: REPORT_TOOL_FULL_NAME,
          input: { conclusion: "架空の二", closing: { text: "架空の締め", expression: "proud" } },
        },
      ]),
      userMessage([{ type: "tool_result", tool_use_id: "r-2", content: "ok" }]),
    ]

    const shown = toRestoredEvents(messages, EXPRESSIONS)
      .filter((event) => event.kind === "report" || event.kind === "speech")
      .map((event) => (event.kind === "report" ? event.conclusion : event.text))

    expect(shown).toEqual(["架空の二", "架空の締め"])
  })

  it("組み直した report も、動いているときと同じく整形してから描く", () => {
    const messages = [
      userMessage("架空の依頼"),
      assistantMessage([
        {
          type: "tool_use",
          id: "r-1",
          name: REPORT_TOOL_FULL_NAME,
          input: { conclusion: "架空の結論。", body: "架空の結論。\n\n架空の根拠。\n\n以上です。" },
        },
      ]),
      userMessage([{ type: "tool_result", tool_use_id: "r-1", content: "ok" }]),
    ]
    const state = toRestoredEvents(messages, EXPRESSIONS).reduce(
      (current, event) => applySessionEvent(current, event, 0),
      INITIAL_SESSION_STATE,
    )

    expect(mainViewEntries(state).filter((entry) => entry.kind === "report")).toEqual([
      {
        kind: "report",
        markdown:
          '<div class="conclusion-lead">\n\n架空の結論。\n\n</div>\n\n<div class="report-sections-start"></div>\n\n架空の根拠。',
        conclusion: "架空の結論。",
        task: { kind: "none" },
      },
    ])
  })

  it("依頼が1つも無い列にはターンの境目を足さない", () => {
    const events = toRestoredEvents(
      [assistantMessage([{ type: "text", text: "架空の本文" }])],
      EXPRESSIONS,
    )

    expect(events).toEqual([{ kind: "utterance", text: "架空の本文" }, HISTORY_RESTORED])
  })

  it("依頼より前の本文のあとの最初の依頼の手前には境目を足さず、2件目の依頼の手前と末尾にだけ足す", () => {
    const messages = [
      assistantMessage([{ type: "text", text: "架空の前置き" }]),
      userMessage("架空の依頼その1"),
      assistantMessage([{ type: "text", text: "架空の本文その1" }]),
      userMessage("架空の依頼その2"),
    ]

    expect(toRestoredEvents(messages, EXPRESSIONS)).toEqual([
      { kind: "utterance", text: "架空の前置き" },
      { kind: "request", text: "架空の依頼その1", images: [] },
      { kind: "utterance", text: "架空の本文その1" },
      { kind: "turn-finished", outcome: { kind: "completed" } },
      { kind: "request", text: "架空の依頼その2", images: [] },
      { kind: "turn-finished", outcome: { kind: "completed" } },
      HISTORY_RESTORED,
    ])
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
      { kind: "turn-finished", outcome: { kind: "completed" } },
      HISTORY_RESTORED,
    ])
  })

  // SDK が展開したスラッシュコマンドは、入力欄から打ったときの見え方（`/<name>` の1行）に
  // 畳む。入力は架空のコマンド名で自分で組む（実物の transcript は使わない）。
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
      { kind: "turn-finished", outcome: { kind: "completed" } },
      HISTORY_RESTORED,
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
      { kind: "turn-finished", outcome: { kind: "completed" } },
      HISTORY_RESTORED,
    ])
  })

  it("タグの無い普通の依頼はそのまま通す", () => {
    const messages = [userMessage([{ type: "text", text: "架空の普通の依頼" }])]

    expect(toRestoredEvents(messages, EXPRESSIONS)).toEqual([
      { kind: "request", text: "架空の普通の依頼", images: [] },
      { kind: "turn-finished", outcome: { kind: "completed" } },
      HISTORY_RESTORED,
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
      { kind: "turn-finished", outcome: { kind: "completed" } },
      HISTORY_RESTORED,
    ])
  })

  it("仕掛けが is_meta を付けて差し込んだ user メッセージは、塊の外の文面ごと依頼として起こさない", () => {
    const messages = [
      Object.assign(
        {},
        userMessage(
          '架空の前置き\n<agent-message from="架空のエージェント">架空の伝言</agent-message>\n\n架空の断り書き',
        ),
        { is_meta: true },
      ),
      userMessage([{ type: "text", text: "架空の依頼" }]),
    ]

    expect(toRestoredEvents(messages, EXPRESSIONS)).toEqual([
      { kind: "request", text: "架空の依頼", images: [] },
      { kind: "turn-finished", outcome: { kind: "completed" } },
      HISTORY_RESTORED,
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
      { kind: "turn-finished", outcome: { kind: "completed" } },
      HISTORY_RESTORED,
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
      { kind: "turn-finished", outcome: { kind: "completed" } },
      HISTORY_RESTORED,
    ])
  })

  // 圧縮（`/compact`）が起きると transcript の鎖が切れ、`includeSystemMessages: true` で読んだ
  // 並びは区切りの行から始まる（`readRestoredEvents`。
  // 実測）。起こし直したあとに区切りがログのいちばん上に来ることをここで示す。
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
      { kind: "turn-finished", outcome: { kind: "completed" } },
      HISTORY_RESTORED,
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
      { kind: "turn-finished", outcome: { kind: "completed" } },
      HISTORY_RESTORED,
    ])
  })
})
