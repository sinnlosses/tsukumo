import { describe, expect, it } from "vitest"

import { asidePromptText } from "../../../../../src/server/session-driver/core/aside-prompt.ts"
import { progressNudgePromptText } from "../../../../../src/server/session-driver/core/progress-nudge.ts"
import { inputLedgerOf } from "../../../../../src/server/session-driver/core/session/input-ledger.ts"
import { assistantMessage, userMessage } from "../../../../fixture/sdk-message.ts"
import { requestEvent } from "../../../../fixture/session-event.ts"
import { eventsOf } from "../../../../fixture/session-restore.ts"

const FIRST = "00000000-0000-4000-8000-000000000001"
const SECOND = "00000000-0000-4000-8000-000000000002"
const THIRD = "00000000-0000-4000-8000-000000000003"
const REPLY = "00000000-0000-4000-8000-000000000004"

/** tsukumo が送った入力の行（`origin` が human で、送ったときの uuid を持つ）。 */
function sent(text: string, uuid: string): unknown {
  return Object.assign({}, userMessage(text), { uuid, origin: { kind: "human" } })
}

function reply(text: string, uuid: string): unknown {
  return Object.assign({}, assistantMessage([{ type: "text", text }]), { uuid })
}

describe("toRestoredEvents（入力の控えのあるセッション）", () => {
  it("控えで依頼と分かる入力は、補足メッセージや差し込みの包みで始まっても依頼のまま残る", () => {
    const aside = asidePromptText("架空の依頼A")
    const progress = progressNudgePromptText("架空の依頼B")
    const ledger = inputLedgerOf([
      { kind: "input", uuid: FIRST, input: "request" },
      { kind: "input", uuid: SECOND, input: "request" },
    ])

    expect(eventsOf([sent(aside, FIRST), sent(progress, SECOND)], ledger)).toEqual([
      requestEvent(aside),
      { kind: "turn-finished", outcome: { kind: "completed" } },
      requestEvent(progress),
      { kind: "turn-finished", outcome: { kind: "completed" } },
    ])
  })

  it("控えで補足メッセージ・差し込みと分かる入力は、包みを外した補足メッセージ・続きのターンにする", () => {
    const ledger = inputLedgerOf([
      { kind: "input", uuid: FIRST, input: "request" },
      { kind: "input", uuid: SECOND, input: "aside" },
      { kind: "input", uuid: THIRD, input: "progress-nudge" },
    ])

    expect(
      eventsOf(
        [
          sent("架空の依頼", FIRST),
          sent(asidePromptText("架空の問い"), SECOND),
          sent(progressNudgePromptText("架空の進み"), THIRD),
        ],
        ledger,
      ).map((event) => event.kind),
    ).toEqual([
      "request",
      "turn-finished",
      "aside",
      "turn-finished",
      "turn-resumed",
      "turn-finished",
    ])
  })

  it("uuid の無いメッセージは、空の鍵で控えを引かず包みで見分ける", () => {
    const aside = asidePromptText("架空の問い")
    const ledger = inputLedgerOf([{ kind: "input", uuid: "", input: "request" }])

    expect(eventsOf([userMessage(aside)], ledger).map((event) => event.kind)).toEqual([
      "aside",
      "turn-finished",
    ])
  })

  it("控えに無い uuid の入力は、包みで見分ける", () => {
    const ledger = inputLedgerOf([{ kind: "input", uuid: FIRST, input: "request" }])

    expect(
      eventsOf([sent("架空の依頼", FIRST), sent(asidePromptText("架空の問い"), SECOND)], ledger)[2],
    ).toEqual({ kind: "aside", text: "架空の問い", images: [] })
  })

  it("控えにあるターンの終わり方（中断・失敗）で閉じ、引けないターンは完了で閉じる", () => {
    const ledger = inputLedgerOf([
      { kind: "input", uuid: FIRST, input: "request" },
      { kind: "turn-end", uuids: [FIRST], outcome: { kind: "interrupted" } },
      {
        kind: "turn-end",
        uuids: [REPLY],
        outcome: { kind: "failed", cause: { kind: "max-turns" } },
      },
    ])
    const notification = Object.assign({}, userMessage("架空の知らせ"), {
      uuid: THIRD,
      origin: { kind: "task-notification" },
    })

    expect(
      eventsOf(
        [
          sent("架空の依頼", FIRST),
          notification,
          reply("架空の続き", REPLY),
          sent("架空の次の依頼", SECOND),
        ],
        ledger,
      ),
    ).toEqual([
      requestEvent(),
      { kind: "turn-finished", outcome: { kind: "interrupted" } },
      { kind: "turn-resumed" },
      { kind: "utterance", text: "架空の続き" },
      { kind: "turn-finished", outcome: { kind: "failed", cause: { kind: "max-turns" } } },
      requestEvent("架空の次の依頼"),
      { kind: "turn-finished", outcome: { kind: "completed" } },
    ])
  })

  it("控えで同じターンが受け取ったと分かる補足メッセージの手前では、ターンを閉じない", () => {
    const ledger = inputLedgerOf([
      { kind: "input", uuid: FIRST, input: "request" },
      { kind: "input", uuid: SECOND, input: "aside" },
      { kind: "turn-end", uuids: [FIRST, SECOND, REPLY], outcome: { kind: "completed" } },
    ])

    expect(
      eventsOf(
        [
          sent("架空の依頼", FIRST),
          sent(asidePromptText("架空の問い"), SECOND),
          reply("架空の答え", REPLY),
        ],
        ledger,
      ).map((event) => event.kind),
    ).toEqual(["request", "aside", "utterance", "turn-finished"])
  })
})
