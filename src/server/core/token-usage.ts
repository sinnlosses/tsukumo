// トークン消費を記録するときの判断（何を1行にするか）と、書き口の契約。**実際に書くのは
// `src/server/adapter/token-usage-log.ts`** で、ここは「累計から増分を作る」ところまでを持つ。
//
// SDK の `result` に乗る `modelUsage` は **`query()` の中の累計**（サブエージェントと内部の
// 呼び出しも含む。`usage` のほうはメインループだけなので集計に使わない）。ターンごとの消費を
// 出すには前の `result` との差を取る必要があり、**前回の累計を覚えているのは
// `src/server/core/session-manager.ts`**（セッション1つぶんの可変の状態を持つのはあそこだけで、
// 変換だけの `sdk-message.ts` に前回値を置くとあのファイルの性格が変わる）。
//
// **数以外は通らない。** 依頼の文面もセリフもツールの引数もここには来ない
// （`docs/coding-standards.md`「会話内容の扱い」）。

import { type ModelTokenUsage, type TokenUsageMode } from "../../shared/token-usage.ts"

/**
 * トークン消費の書き込み口（`chat-archive` と同じ形の契約）。**実装は `adapter` 側**
 * （`src/server/adapter/token-usage-log.ts`）で、ここにあるのは契約だけ。
 *
 * 書けなくても例外を投げない（常駐プロセスは1回の失敗で落ちない。
 * `docs/coding-standards.md`「エラーハンドリング」）ので、受け付けたかどうかは返さない。
 */
export type TokenUsageLog = {
  readonly append: (entry: TokenUsageEntry) => void
}

/**
 * 1ターンぶんの記録（**書き出す行そのものではない**）。`at` はエポックミリ秒で、ISO 8601 への
 * 変換と日付ごとのファイルの選択は `adapter` 側の仕事（`ChatArchiveEntry` と同じ切り分け）。
 */
export type TokenUsageEntry = {
  readonly at: number
  readonly sessionId: string
  readonly mode: TokenUsageMode
  /** そのターンの増分（{@link tokenUsageDelta} の戻り値）。 */
  readonly models: readonly ModelTokenUsage[]
}

/**
 * 前の `result` の累計と今の累計から、そのターンの増分を作る。
 *
 * - **増えていないモデルは返さない**（0 だけの行を積まない）。すべてのモデルが増えていなければ
 *   空の並びになり、呼ぶ側は行を書かない
 * - **累計が振り出しに戻ったモデルは、いまの累計をそのまま増分にする**（負を書かない）。
 *   起こし直し（resume）とターンの途中の `/clear` で走行合計がリセットされると SDK の型定義が
 *   言っている。1つでも数が減っていたらリセットとみなす（一部だけ引くと、残りの数が実際より
 *   大きい増分になる）
 * - 前の累計にしか無いモデルは落とす（そのターンで使われていない）
 *
 * `costUsd` は引き算で浮動小数の誤差が出る（`0.7 - 0.5` が `0.19999999999999996` になる）ので、
 * 小数10桁で丸めてから返す。これより細かい桁は SDK 側の値にも無い。
 */
export function tokenUsageDelta(
  previous: readonly ModelTokenUsage[],
  current: readonly ModelTokenUsage[],
): readonly ModelTokenUsage[] {
  return current.flatMap((now) => {
    const before = previous.find((candidate) => candidate.model === now.model)
    const delta = before === undefined || hasDecreased(before, now) ? now : subtract(before, now)
    return isEmptyUsage(delta) ? [] : [delta]
  })
}

/** 1つでも数が減っていれば、そのモデルの走行合計は振り出しに戻っている。 */
function hasDecreased(before: ModelTokenUsage, now: ModelTokenUsage): boolean {
  return (
    now.inputTokens < before.inputTokens ||
    now.outputTokens < before.outputTokens ||
    now.thinkingTokens < before.thinkingTokens ||
    now.cacheReadInputTokens < before.cacheReadInputTokens ||
    now.cacheCreationInputTokens < before.cacheCreationInputTokens ||
    now.costUsd < before.costUsd
  )
}

function subtract(before: ModelTokenUsage, now: ModelTokenUsage): ModelTokenUsage {
  return {
    model: now.model,
    inputTokens: now.inputTokens - before.inputTokens,
    outputTokens: now.outputTokens - before.outputTokens,
    thinkingTokens: now.thinkingTokens - before.thinkingTokens,
    cacheReadInputTokens: now.cacheReadInputTokens - before.cacheReadInputTokens,
    cacheCreationInputTokens: now.cacheCreationInputTokens - before.cacheCreationInputTokens,
    costUsd: roundCost(now.costUsd - before.costUsd),
  }
}

function isEmptyUsage(usage: ModelTokenUsage): boolean {
  return (
    usage.inputTokens === 0 &&
    usage.outputTokens === 0 &&
    usage.thinkingTokens === 0 &&
    usage.cacheReadInputTokens === 0 &&
    usage.cacheCreationInputTokens === 0 &&
    usage.costUsd === 0
  )
}

function roundCost(value: number): number {
  return Math.round(value * 1e10) / 1e10
}
