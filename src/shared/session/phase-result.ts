// `phase_result` ツール（委譲先が段の結果を返す構造化した返却）の引数の形と、`DelegateReturn` への写し方。
// 引数の正典は `docs/architecture/workflow-contract.md`「スキルの契約」。

import { z } from "zod"

import { isBlankText } from "../utils/blank-text.ts"
import type { DelegateReturn } from "./delegate-return.ts"

/** 段の結果。`finished` は済ませた、`skipped` は飛ばした、`stopped` は途中で止めた。 */
export const PHASE_OUTCOMES = ["finished", "skipped", "stopped"] as const

/** 引数を読んだ形。止めた理由は `stopped` だけが持つ。 */
export type PhaseResult =
  | {
      readonly phase: number
      readonly count: number
      readonly outcome: "finished" | "skipped"
    }
  | {
      readonly phase: number
      readonly count: number
      readonly outcome: "stopped"
      readonly reason: string
    }

/**
 * `phase_result` の引数の欄。ツールはこの欄に説明文を足して渡す。
 * 欄をまたぐ検査は {@link phaseResultSchema} が持つ。
 */
export const phaseResultShape = {
  phase: z.number().int().min(1),
  count: z.number().int().min(1),
  outcome: z.enum(PHASE_OUTCOMES),
  reason: z.string().optional(),
}

/**
 * `phase_result` の引数の形の正典。
 * `phase` が `count` を超える・`stopped` に空でない `reason` が無い・`stopped` でないのに `reason` がある、のどれかなら通らない。
 */
export const phaseResultSchema = z.object(phaseResultShape).superRefine((value, context) => {
  const reject = (path: string): void => {
    context.addIssue({ code: "custom", message: "invalid phase result", path: [path] })
  }
  if (value.phase > value.count) {
    reject("phase")
  }
  if (
    value.outcome === "stopped"
      ? value.reason === undefined || isBlankText(value.reason)
      : value.reason !== undefined
  ) {
    reject("reason")
  }
})

/**
 * 外来の値（ツールの引数）を段の結果として読む。{@link phaseResultSchema} を通らなければ undefined。
 * handler が差し戻すかどうかと、変換がイベントにするかどうかは、この1つで決まる。
 */
export function parsePhaseResult(value: unknown): PhaseResult | undefined {
  const parsed = phaseResultSchema.safeParse(value)
  if (!parsed.success) {
    return undefined
  }
  const { phase, count, outcome, reason = "" } = parsed.data
  return outcome === "stopped" ? { phase, count, outcome, reason } : { phase, count, outcome }
}

/** 段の結果を、委譲の返却の形にする。`finished` は要約の空の `phase-done`。 */
export function delegateReturnOf(result: PhaseResult): DelegateReturn {
  switch (result.outcome) {
    case "finished":
      return { kind: "phase-done", phase: result.phase, count: result.count, summary: "" }
    case "skipped":
      return { kind: "phase-skipped", phase: result.phase, count: result.count }
    case "stopped":
      return { kind: "stopped", phase: result.phase, count: result.count, summary: result.reason }
  }
}
