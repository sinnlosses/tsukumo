// 委譲先の `SendMessage` の引数から、委譲の合図の段の位置を読む。
// 合図の形は `SPEECH_CADENCE_PROMPT` の「合図」の条が持つ。
// 読むのは1行目の `n/N` だけで、合図の文は呼ぶ側に返さない。

import { isPlainObject } from "remeda"

import type { DelegateSignal } from "../../../shared/session/work-plan.ts"

/** 合図を送る Claude Code のツールの名前。 */
export const SEND_MESSAGE_TOOL_NAME = "SendMessage"

/**
 * `SendMessage` の引数が、メインに宛てた合図 `状況 | n/N | …` なら段の位置を返す。
 * 宛先が `main` でない・1行目が合図の形でない・`1 <= n <= N` でないなら undefined。
 */
export function parseDelegateSignal(input: unknown): DelegateSignal | undefined {
  if (!isPlainObject(input) || input.to !== "main" || typeof input.message !== "string") {
    return undefined
  }
  const matched = SIGNAL_FIRST_LINE.exec(input.message.split("\n", 1)[0] ?? "")
  if (matched === null) {
    return undefined
  }
  const step = Number(matched[1])
  const stepCount = Number(matched[2])
  return step >= 1 && step <= stepCount ? { step, stepCount } : undefined
}

const SIGNAL_FIRST_LINE = /^状況 \| (\d+)\/(\d+) \|/
