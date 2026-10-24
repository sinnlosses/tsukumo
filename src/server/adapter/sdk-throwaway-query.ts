// 使い捨ての `query()` のメッセージの流れを流しながら、1回ぶんの足跡を作って記録の口へ渡す包みと、中断の繋ぎ。
// `query()` は起こさない（起こすのは各 adapter）。
//
// 足跡に入れるのは種類・開始の時刻・所要・トークンの数・結果の種類だけで、メッセージの文面は読まない。
// result の形は外から来る値なので、要る欄だけを zod で確かめる。

import { z } from "zod"

import {
  THROWAWAY_QUERY_RESULT_OUTCOMES,
  type ThrowawayQueryFootprint,
  type ThrowawayQueryKind,
  type ThrowawayQueryRecorder,
  type ThrowawayQueryResultOutcome,
  type ThrowawayQueryUnfinishedOutcome,
} from "../core/throwaway-query.ts"

/** 足跡を残す先と、その問い合わせの種類。 */
export type ThrowawayQueryWatch = {
  readonly kind: ThrowawayQueryKind
  readonly record: ThrowawayQueryRecorder
  /** 現在時刻（エポックミリ秒）。 */
  readonly now: () => number
}

/** `signal` が中断したら中断する `AbortController`（`query()` の `abortController` に渡す）。 */
export function abortControllerFor(signal: AbortSignal): AbortController {
  const abortController = new AbortController()
  if (signal.aborted) {
    abortController.abort()
  } else {
    signal.addEventListener(
      "abort",
      () => {
        abortController.abort()
      },
      { once: true },
    )
  }
  return abortController
}

/**
 * `messages` をそのまま流し、流れが終わる・投げる・読み手が途中でやめる時点で、足跡を1回だけ `watch.record` へ渡す。
 * 投げたものはそのまま投げ直す。投げた時点で `signal` が中断していれば `aborted`、でなければ `threw`。
 */
export async function* recordedMessages<M>(
  messages: AsyncIterable<M>,
  watch: ThrowawayQueryWatch,
  signal: AbortSignal,
): AsyncGenerator<M, void, undefined> {
  const startedAt = watch.now()
  let ending: FootprintEnding = { outcome: "no-result" }
  try {
    for await (const message of messages) {
      const result = resultEndingOf(message)
      if (result !== undefined) {
        ending = result
      }
      yield message
    }
  } catch (error) {
    ending = { outcome: signal.aborted ? "aborted" : "threw" }
    throw error
  } finally {
    watch.record(footprintOf(watch.kind, startedAt, watch.now() - startedAt, ending))
  }
}

/** 足跡のうち、流れの終わり方で決まる欄。 */
type FootprintEnding =
  | {
      readonly outcome: ThrowawayQueryResultOutcome
      readonly inputTokens: number
      readonly outputTokens: number
    }
  | { readonly outcome: ThrowawayQueryUnfinishedOutcome }

const modelUsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadInputTokens: z.number(),
  cacheCreationInputTokens: z.number(),
})

const resultMessageSchema = z.object({
  type: z.literal("result"),
  subtype: z.string(),
  modelUsage: z.record(z.string(), modelUsageSchema),
})

/** result のメッセージなら、結果の種類と全モデルのトークンの和。それ以外は undefined。 */
function resultEndingOf(message: unknown): FootprintEnding | undefined {
  const parsed = resultMessageSchema.safeParse(message)
  if (!parsed.success) {
    return undefined
  }
  const usages = Object.values(parsed.data.modelUsage)
  return {
    outcome: resultOutcomeOf(parsed.data.subtype),
    inputTokens: usages.reduce(
      (sum, usage) =>
        sum + usage.inputTokens + usage.cacheReadInputTokens + usage.cacheCreationInputTokens,
      0,
    ),
    outputTokens: usages.reduce((sum, usage) => sum + usage.outputTokens, 0),
  }
}

function resultOutcomeOf(subtype: string): ThrowawayQueryResultOutcome {
  return THROWAWAY_QUERY_RESULT_OUTCOMES.find((outcome) => outcome === subtype) ?? "other"
}

function footprintOf(
  kind: ThrowawayQueryKind,
  startedAt: number,
  durationMs: number,
  ending: FootprintEnding,
): ThrowawayQueryFootprint {
  return { kind, startedAt, durationMs, ...ending }
}
