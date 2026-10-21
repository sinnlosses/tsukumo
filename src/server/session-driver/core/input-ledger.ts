// 入力の控え。tsukumo が送った入力の種類と、ターンの終わり方を、送った `SDKUserMessage` の `uuid` を鍵に持つ。
// transcript には種類（依頼・脇の話・進みの差し込み）も、ターンの終わり方（`result`）も残らないので、組み直しはここを引く。
// 持つのは uuid・種類・終わり方だけで、本文は持たない。

import { isPlainObject } from "remeda"
import { z } from "zod"

import type { TurnOutcome } from "../../../shared/session-driver/turn-failure.ts"
import { parseSessionId, type SessionId } from "./session-id.ts"

/** 控えに残す入力の種類。 */
export type LedgeredInputKind = "request" | "aside" | "progress-nudge"

const LEDGERED_INPUT_KINDS = [
  "request",
  "aside",
  "progress-nudge",
] as const satisfies readonly LedgeredInputKind[]

const turnOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("completed") }),
  z.object({ kind: z.literal("interrupted") }),
  z.object({
    kind: z.literal("failed"),
    cause: z.object({ kind: z.enum(["api-error", "max-turns", "max-budget", "execution-error"]) }),
  }),
]) satisfies z.ZodType<TurnOutcome>

/**
 * 控えの1行。
 * `input` は送った入力1件の種類、`turn-end` はターン1つの終わり方で、`uuids` はそのターンに結べる鍵
 * （ターンが受け取った入力の uuid と、ターンの最後のメインの `assistant` の uuid）。
 */
export const inputLedgerLineSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("input"), uuid: z.guid(), input: z.enum(LEDGERED_INPUT_KINDS) }),
  z.object({
    kind: z.literal("turn-end"),
    uuids: z.array(z.guid()).min(1),
    outcome: turnOutcomeSchema,
  }),
])

export type InputLedgerLine = Readonly<z.infer<typeof inputLedgerLineSchema>>

/** 控えから引いたターン1つ。同じターンに結べる鍵は同じものを返す。 */
export type LedgeredTurn = { readonly outcome: TurnOutcome }

/** 組み直しが引く控え。 */
export type InputLedger = {
  readonly inputKindOf: (uuid: string) => LedgeredInputKind | undefined
  readonly turnOf: (uuid: string) => LedgeredTurn | undefined
}

/** 控えの無いセッションの控え。何も引けない。 */
export const EMPTY_INPUT_LEDGER: InputLedger = {
  inputKindOf: () => undefined,
  turnOf: () => undefined,
}

/** 読んだ控えの行を、引ける形にする。同じ鍵が2度出たら後の行を採る。 */
export function inputLedgerOf(lines: readonly InputLedgerLine[]): InputLedger {
  const kinds: ReadonlyMap<string, LedgeredInputKind> = new Map(
    lines.flatMap((line) => (line.kind === "input" ? [[line.uuid, line.input] as const] : [])),
  )
  const turns: ReadonlyMap<string, LedgeredTurn> = new Map(
    lines.flatMap((line) => {
      if (line.kind !== "turn-end") {
        return []
      }
      const turn: LedgeredTurn = { outcome: line.outcome }
      return line.uuids.map((uuid) => [uuid, turn] as const)
    }),
  )
  return {
    inputKindOf: (uuid) => kinds.get(uuid),
    turnOf: (uuid) => turns.get(uuid),
  }
}

/** ターンの終わりに書く控え。`sessionId` は `result` が運んだもの。 */
export type InputLedgerEntry = {
  readonly sessionId: SessionId
  readonly lines: readonly InputLedgerLine[]
}

/**
 * 駆動の側で控えを組む口。セッション1つに1つ。
 * 送ってから `result` が届くまで種類をメモリに預け、`result` で、そのターンが受け取った入力の分だけ控えの行にする。
 * 最初の依頼を送る時点ではセッションの ID がまだ分からないので、書くのは `result` のとき。
 */
export type InputLedgerIntake = {
  /** 送った入力1件の uuid と種類を預ける。 */
  readonly noteSent: (uuid: string, kind: LedgeredInputKind) => void
  /** メインのメッセージを見せる（ターンの最後のメインの `assistant` の uuid を覚える）。 */
  readonly observe: (message: unknown) => void
  /** `result` と、それを畳んだ終わり方から控えの行を作る。書けるものが無ければ undefined。 */
  readonly finishTurn: (result: unknown, outcome: TurnOutcome) => InputLedgerEntry | undefined
}

/** {@link InputLedgerIntake} を1つ作る。 */
export function createInputLedgerIntake(): InputLedgerIntake {
  let pending: ReadonlyMap<string, LedgeredInputKind> = new Map()
  let lastAssistant: string | undefined = undefined

  return {
    noteSent: (uuid, kind) => {
      pending = new Map([...pending, [uuid, kind]])
    },
    observe: (message) => {
      if (
        isPlainObject(message) &&
        message.type === "assistant" &&
        (message.parent_tool_use_id === null || message.parent_tool_use_id === undefined) &&
        typeof message.uuid === "string"
      ) {
        lastAssistant = message.uuid
      }
    },
    finishTurn: (result, outcome) => {
      const consumed = consumedInputUuids(result)
      const keys = lastAssistant === undefined ? consumed : [...consumed, lastAssistant]
      lastAssistant = undefined
      const inputs = consumed.flatMap((uuid): readonly InputLedgerLine[] => {
        const kind = pending.get(uuid)
        return kind === undefined ? [] : [{ kind: "input", uuid, input: kind }]
      })
      pending = new Map([...pending].filter(([uuid]) => !consumed.includes(uuid)))
      const sessionId = sessionIdOf(result)
      if (sessionId === undefined || keys.length === 0) {
        return undefined
      }
      return { sessionId, lines: [...inputs, { kind: "turn-end", uuids: [...keys], outcome }] }
    },
  }
}

/** `result` の `user_message_uuids`（無ければ `user_message_uuid`）。ターンが受け取った入力の uuid。 */
function consumedInputUuids(result: unknown): readonly string[] {
  if (!isPlainObject(result)) {
    return []
  }
  if (Array.isArray(result.user_message_uuids)) {
    return result.user_message_uuids.filter((uuid): uuid is string => typeof uuid === "string")
  }
  return typeof result.user_message_uuid === "string" ? [result.user_message_uuid] : []
}

function sessionIdOf(result: unknown): SessionId | undefined {
  return isPlainObject(result) && typeof result.session_id === "string"
    ? parseSessionId(result.session_id)
    : undefined
}
