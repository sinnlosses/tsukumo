import { describe, expect, it } from "vitest"

import {
  createInputLedgerIntake,
  EMPTY_INPUT_LEDGER,
  inputLedgerLineSchema,
  inputLedgerOf,
} from "../../../../src/server/session-driver/core/input-ledger.ts"

const SESSION = "00000000-0000-4000-8000-0000000000aa"
const REQUEST = "00000000-0000-4000-8000-000000000001"
const ASIDE = "00000000-0000-4000-8000-000000000002"
const ASSISTANT = "00000000-0000-4000-8000-000000000003"

function result(fields: Readonly<Record<string, unknown>>): unknown {
  return { type: "result", subtype: "success", session_id: SESSION, ...fields }
}

function mainAssistant(uuid: string): unknown {
  return { type: "assistant", uuid, parent_tool_use_id: null, message: { content: [] } }
}

describe("createInputLedgerIntake", () => {
  it("ターンが受け取った入力の種類と、最後のメインの assistant を含む鍵で、終わり方の行を作る", () => {
    const intake = createInputLedgerIntake()
    intake.noteSent(REQUEST, "request")
    intake.noteSent(ASIDE, "aside")
    intake.observe(mainAssistant(ASSISTANT))

    expect(
      intake.finishTurn(result({ user_message_uuids: [REQUEST, ASIDE] }), {
        kind: "interrupted",
      }),
    ).toEqual({
      sessionId: SESSION,
      lines: [
        { kind: "input", uuid: REQUEST, input: "request" },
        { kind: "input", uuid: ASIDE, input: "aside" },
        { kind: "turn-end", uuids: [REQUEST, ASIDE, ASSISTANT], outcome: { kind: "interrupted" } },
      ],
    })
  })

  it("入力の uuid を持たない自発のターンは、最後のメインの assistant の uuid だけで結ぶ", () => {
    const intake = createInputLedgerIntake()
    intake.observe(mainAssistant(ASSISTANT))
    intake.observe({
      type: "assistant",
      uuid: REQUEST,
      parent_tool_use_id: "toolu_x",
      message: { content: [] },
    })

    expect(intake.finishTurn(result({}), { kind: "completed" })?.lines).toEqual([
      { kind: "turn-end", uuids: [ASSISTANT], outcome: { kind: "completed" } },
    ])
  })

  it("まだ受け取られていない入力は預けたまま、次のターンの行に出す", () => {
    const intake = createInputLedgerIntake()
    intake.noteSent(REQUEST, "request")
    intake.noteSent(ASIDE, "aside")

    intake.finishTurn(result({ user_message_uuid: REQUEST }), { kind: "completed" })
    const next = intake.finishTurn(result({ user_message_uuids: [ASIDE] }), {
      kind: "failed",
      cause: { kind: "max-turns" },
    })

    expect(next?.lines).toEqual([
      { kind: "input", uuid: ASIDE, input: "aside" },
      {
        kind: "turn-end",
        uuids: [ASIDE],
        outcome: { kind: "failed", cause: { kind: "max-turns" } },
      },
    ])
  })

  it("セッションの ID が UUID の綴りでない・鍵が1つも無いときは何も書かない", () => {
    const intake = createInputLedgerIntake()
    intake.noteSent(REQUEST, "request")

    expect(
      intake.finishTurn(result({ session_id: "../架空", user_message_uuid: REQUEST }), {
        kind: "completed",
      }),
    ).toBeUndefined()
    expect(intake.finishTurn(result({}), { kind: "completed" })).toBeUndefined()
  })
})

describe("inputLedgerOf", () => {
  it("入力の種類と、同じターンの鍵から同じターンを引く", () => {
    const ledger = inputLedgerOf([
      { kind: "input", uuid: REQUEST, input: "request" },
      { kind: "turn-end", uuids: [REQUEST, ASSISTANT], outcome: { kind: "interrupted" } },
    ])

    expect(ledger.inputKindOf(REQUEST)).toBe("request")
    expect(ledger.inputKindOf(ASIDE)).toBeUndefined()
    expect(ledger.turnOf(REQUEST)).toEqual({ outcome: { kind: "interrupted" } })
    expect(ledger.turnOf(REQUEST)).toBe(ledger.turnOf(ASSISTANT))
    expect(EMPTY_INPUT_LEDGER.turnOf(REQUEST)).toBeUndefined()
  })

  it("控えの行の形は、書いた行をそのまま読み戻せ、本文の欄を持たない", () => {
    const line = { kind: "input", uuid: REQUEST, input: "aside", text: "架空の本文" }

    expect(inputLedgerLineSchema.parse(line)).toEqual({
      kind: "input",
      uuid: REQUEST,
      input: "aside",
    })
    expect(
      inputLedgerLineSchema.safeParse({ kind: "input", uuid: "架空", input: "aside" }).success,
    ).toBe(false)
  })
})
