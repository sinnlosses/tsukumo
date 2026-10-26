import { describe, expect, it } from "vitest"

import { asidePromptText } from "../../../../src/server/session-driver/core/aside-prompt.ts"
import { EMPTY_INPUT_LEDGER } from "../../../../src/server/session-driver/core/input-ledger.ts"
import { progressNudgePromptText } from "../../../../src/server/session-driver/core/progress-nudge.ts"
import { toRestoredEvents } from "../../../../src/server/session-driver/core/session-restore.ts"
import { mainViewEntries } from "../../../../src/shared/session/main-view-entry.ts"
import { turnAsides } from "../../../../src/shared/session/main-view-shape.ts"
import { mainViewTurns } from "../../../../src/shared/session/main-view.ts"
import { applyRestoredEvents } from "../../../../src/shared/session/restored-event.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session/session-state.ts"
import { EXPRESSIONS } from "../../../fixture/sdk-assistant-message.ts"
import {
  assistantMessage,
  SPEAK_TOOL_FULL_NAME,
  userMessage,
} from "../../../fixture/sdk-message.ts"
import { requestEvent } from "../../../fixture/session-event.ts"
import { eventsOf } from "../../../fixture/session-restore.ts"

/** `getSessionMessages` がメッセージに載せる出自の欄（`is_meta`・`origin`・`isCompletedLocalCommand`）を足す。 */
function withFields(message: unknown, fields: Readonly<Record<string, unknown>>): unknown {
  return Object.assign({}, message, fields)
}

describe("toRestoredEvents", () => {
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

    expect(eventsOf(messages)).toEqual([
      requestEvent("/架空コマンド"),
      { kind: "turn-finished", outcome: { kind: "completed" } },
    ])
  })

  it("引数のあるスラッシュコマンドは `/<name> <args>` に畳む", () => {
    const messages = [
      userMessage(
        "<command-name>/架空コマンド</command-name>\n<command-args>架空の引数</command-args>",
      ),
    ]

    expect(eventsOf(messages)).toEqual([
      requestEvent("/架空コマンド 架空の引数"),
      { kind: "turn-finished", outcome: { kind: "completed" } },
    ])
  })

  it("仕掛けが欄を付けて差し込んだ user メッセージは依頼として起こさない", () => {
    const messages = [
      withFields(userMessage("<local-command-caveat>架空の断り書き</local-command-caveat>"), {
        is_meta: true,
      }),
      withFields(
        userMessage('<agent-message from="架空のエージェント">架空の伝言</agent-message>'),
        {
          is_meta: true,
          origin: { kind: "peer", from: "架空のID" },
        },
      ),
      userMessage([{ type: "text", text: "架空の依頼" }]),
    ]

    expect(eventsOf(messages)).toEqual([
      requestEvent(),
      { kind: "turn-finished", outcome: { kind: "completed" } },
    ])
  })

  it("is_meta が付いていれば、知らないタグの塊でも依頼として起こさない", () => {
    const messages = [
      userMessage("架空の依頼"),
      withFields(userMessage("<架空の新しいタグ>架空の差し込み</架空の新しいタグ>"), {
        is_meta: true,
      }),
    ]

    expect(eventsOf(messages).map((event) => event.kind)).toEqual(["request", "turn-finished"])
  })

  it("origin の kind が human でない user メッセージは、地の文でも依頼として起こさない", () => {
    const messages = [
      userMessage("架空の依頼"),
      withFields(userMessage("架空の地の文"), { origin: { kind: "架空の出どころ" } }),
    ]

    expect(eventsOf(messages).map((event) => event.kind)).toEqual(["request", "turn-finished"])
  })

  it("origin の kind が human の user メッセージは依頼にする", () => {
    const messages = [withFields(userMessage("架空の依頼"), { origin: { kind: "human" } })]

    expect(eventsOf(messages)).toEqual([
      requestEvent(),
      { kind: "turn-finished", outcome: { kind: "completed" } },
    ])
  })

  it("origin が human なら、is_meta が付いていても依頼にする", () => {
    const messages = [
      withFields(userMessage("架空の依頼"), { origin: { kind: "human" }, is_meta: true }),
    ]

    expect(eventsOf(messages)).toEqual([
      requestEvent(),
      { kind: "turn-finished", outcome: { kind: "completed" } },
    ])
  })

  it("origin が human でも、isCompletedLocalCommand の出力は依頼として起こさない", () => {
    const messages = [
      withFields(
        userMessage(
          "<command-name>/架空コマンド</command-name>\n<command-message>架空コマンド</command-message>\n<command-args></command-args>",
        ),
        { origin: { kind: "human" }, isCompletedLocalCommand: true },
      ),
      withFields(userMessage("<local-command-stdout>架空の出力</local-command-stdout>"), {
        origin: { kind: "human" },
        isCompletedLocalCommand: true,
      }),
      assistantMessage([{ type: "text", text: "架空の本文" }]),
    ]

    expect(eventsOf(messages)).toEqual([
      requestEvent("/架空コマンド"),
      { kind: "utterance", text: "架空の本文" },
      { kind: "turn-finished", outcome: { kind: "completed" } },
    ])
  })

  it("origin の kind が task-notification の user メッセージは、本文によらず続きのターンを始める", () => {
    const messages = [
      userMessage("架空の依頼"),
      withFields(userMessage("架空の知らせ"), { origin: { kind: "task-notification" } }),
    ]

    expect(eventsOf(messages).map((event) => event.kind)).toEqual([
      "request",
      "turn-finished",
      "turn-resumed",
      "turn-finished",
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

    expect(eventsOf(messages)).toEqual([
      requestEvent(),
      { kind: "turn-finished", outcome: { kind: "completed" } },
    ])
  })

  it("欄の無い user メッセージは、仕掛けと同じ名前のタグを含んでもそのままの文面で依頼にする", () => {
    const notification = "<task-notification>\n<task-id>架空のID</task-id>\n</task-notification>"
    const reminder =
      "架空の依頼の前半\n<system-reminder>架空の文面</system-reminder>\n架空の依頼の後半"
    const stdout = "<local-command-stdout>架空の文面</local-command-stdout>"
    const finished: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }

    expect(
      eventsOf([userMessage(notification), userMessage(reminder), userMessage(stdout)]),
    ).toEqual([
      requestEvent(notification),
      finished,
      requestEvent(reminder),
      finished,
      requestEvent(stdout),
      finished,
    ])
  })

  it("isCompletedLocalCommand のコマンドの行は依頼に畳み、同じ欄の出力は依頼として起こさない", () => {
    const messages = [
      withFields(
        userMessage(
          "<command-name>/架空コマンド</command-name>\n<command-message>架空コマンド</command-message>\n<command-args></command-args>",
        ),
        { isCompletedLocalCommand: true },
      ),
      withFields(userMessage("<local-command-stdout>架空の出力</local-command-stdout>"), {
        isCompletedLocalCommand: true,
      }),
      assistantMessage([{ type: "text", text: "架空の本文" }]),
    ]

    expect(eventsOf(messages)).toEqual([
      requestEvent("/架空コマンド"),
      { kind: "utterance", text: "架空の本文" },
      { kind: "turn-finished", outcome: { kind: "completed" } },
    ])
  })

  it("包んだ user メッセージは脇の話に戻り、組み直した姿でも札は増えず、知らせのあとの続きのセリフは答えにならない", () => {
    const speak = (id: string, text: string): unknown =>
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
      speak("t-1", "任せてくるね"),
      userMessage(asidePromptText("架空の問い")),
      speak("t-2", "架空の答え"),
      withFields(
        userMessage("<task-notification>\n<task-id>架空のID</task-id>\n</task-notification>"),
        { origin: { kind: "task-notification" } },
      ),
      speak("t-3", "架空の続き"),
    ]

    const events = eventsOf(messages)
    expect(events.map((event) => event.kind)).toEqual([
      "request",
      "speech",
      "speak-drawn",
      "turn-finished",
      "aside",
      "speech",
      "speak-drawn",
      "turn-finished",
      "turn-resumed",
      "speech",
      "speak-drawn",
      "turn-finished",
    ])
    expect(events[4]).toEqual({ kind: "aside", text: "架空の問い", images: [] })

    const state = applyRestoredEvents(
      INITIAL_SESSION_STATE,
      toRestoredEvents(messages, EXPRESSIONS, EMPTY_INPUT_LEDGER),
      0,
    )
    const turns = mainViewTurns(mainViewEntries(state), { report: false, utterance: false }, true)
    expect(turns).toHaveLength(1)
    expect(turns[0] === undefined ? [] : turnAsides(turns[0])).toEqual([
      { text: "架空の問い", answer: { kind: "answered", text: "架空の答え" } },
    ])
  })

  it("進みの差し込みの包みは依頼に戻さず、続きのターンの始まりにする", () => {
    const messages = [
      withFields(userMessage("架空の依頼"), { origin: { kind: "human" } }),
      withFields(userMessage(progressNudgePromptText("架空の進み")), {
        origin: { kind: "human" },
      }),
    ]

    const events = eventsOf(messages)
    expect(events.map((event) => event.kind)).toEqual([
      "request",
      "turn-finished",
      "turn-resumed",
      "turn-finished",
    ])
  })

  it("is_meta の要約がバックグラウンドタスクの知らせを含んでも、続きのターンにはしない", () => {
    const messages = [
      userMessage("架空の依頼"),
      Object.assign(
        {},
        userMessage(
          "架空の要約\n<task-notification>\n<task-id>架空のID</task-id>\n</task-notification>",
        ),
        { is_meta: true },
      ),
    ]

    expect(eventsOf(messages).map((event) => event.kind)).toEqual(["request", "turn-finished"])
  })
})
