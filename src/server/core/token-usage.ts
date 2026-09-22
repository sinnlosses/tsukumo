// トークン消費を記録するときの判断（何を1行にするか）と、書き口の契約。**実際に書くのは
// `src/server/adapter/token-usage-log.ts`** で、ここは「累計から増分を作る」「ターンの中の内訳を
// 積んで畳む」ところまでを持つ。
//
// SDK の `result` に乗る `modelUsage` は **`query()` の中の累計**（サブエージェントと内部の
// 呼び出しも含む。`usage` のほうはメインループだけなので集計に使わない）。ターンごとの消費を
// 出すには前の `result` との差を取る必要があり、**前回の累計を覚えているのは
// `src/server/core/session-manager.ts`**（セッション1つぶんの可変の状態を持つのはあそこだけで、
// 変換だけの `sdk-message.ts` に前回値を置くとあのファイルの性格が変わる）。
//
// **数以外は通らない。** ツールの結果はここで**長さ（UTF-8 のバイト数）に畳んでから**積み、
// 本文は捨てる。依頼の文面もセリフもツールの引数もここには残らない
// （`docs/coding-standards.md`「会話内容の扱い」）。

import { type SessionEvent } from "../../shared/session-event.ts"
import {
  type ModelTokenUsage,
  type ScopeUsage,
  type TokenUsageMode,
  type StepTokenUsage,
  type ToolUsageCount,
  type TurnUsageBreakdown,
  type TurnUsageScope,
} from "../../shared/token-usage.ts"

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
  /** ターンの中の内訳（{@link turnUsageBreakdown} の戻り値）。 */
  readonly breakdown: TurnUsageBreakdown
}

/**
 * ターンの途中で積み上げる内訳の入れ物。**ターンの終わりに {@link turnUsageBreakdown} で畳んで
 * 書き出し、{@link EMPTY_TURN_USAGE_TALLY} に戻す**（持ち主は `session-manager.ts`）。
 *
 * **ここに文面は入らない** — ツールの結果は受け取った時点で長さに畳む。
 */
export type TurnUsageTally = {
  /** 始まったツールの呼び出し1件ずつ（結果の長さを足す先を `toolUseId` で引くため）。 */
  readonly calls: readonly ToolCallTally[]
  /** assistant のステップの使用量。**同じ `messageId` は最後の1つだけが残る。** */
  readonly steps: readonly StepTally[]
}

/** ツールの呼び出し1件（{@link TurnUsageTally} の中だけで使う）。 */
type ToolCallTally = {
  readonly toolUseId: string
  readonly scope: TurnUsageScope
  readonly name: string
  readonly resultBytes: number
}

/** assistant のステップ1つ（同上）。 */
type StepTally = {
  readonly messageId: string
  readonly scope: TurnUsageScope
  readonly usage: StepTokenUsage
}

const EMPTY_STEP_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
} satisfies StepTokenUsage

const textEncoder = new TextEncoder()

/** ターンの始まりの状態（何も積んでいない）。 */
export const EMPTY_TURN_USAGE_TALLY = { calls: [], steps: [] } satisfies TurnUsageTally

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

/**
 * イベント1件を内訳に積む。**見るのは3種類だけ**で、他のイベントはそのまま返す。
 *
 * - `tool-started`: 呼び出しを1件足す（**始まった時点で数える** — 結果が返らずにターンが
 *   終わった呼び出しも「使った」ことは変わらない）。持ち場は `parentToolUseId` で決まる
 * - `tool-finished`: 結果の**長さだけ**を、同じ `toolUseId` の呼び出しに足す。**本文は捨てる**
 * - `step-usage`: 同じ `messageId` の古いぶんを捨てて置き換える。**返答が流れている間は同じ
 *   `message.id` の `assistant` が何度も届き、途中の `usage` は確定値ではない**ので
 *   （`sdk.d.ts`）、**最後に届いたものだけ**を残す
 */
export function tallyTurnUsage(tally: TurnUsageTally, event: SessionEvent): TurnUsageTally {
  switch (event.kind) {
    case "tool-started":
      return {
        ...tally,
        calls: [
          ...tally.calls,
          {
            toolUseId: event.toolUseId,
            scope: event.parentToolUseId === undefined ? "main" : "subagent",
            name: event.name,
            resultBytes: 0,
          },
        ],
      }
    case "tool-finished": {
      const bytes = byteLength(event.content)
      return {
        ...tally,
        calls: tally.calls.map((call) =>
          call.toolUseId === event.toolUseId
            ? { ...call, resultBytes: call.resultBytes + bytes }
            : call,
        ),
      }
    }
    case "step-usage":
      return {
        ...tally,
        steps: [
          ...tally.steps.filter((step) => step.messageId !== event.messageId),
          { messageId: event.messageId, scope: event.scope, usage: event.usage },
        ],
      }
    default:
      return tally
  }
}

/**
 * 積み上げた内訳を、記録に書く形に畳む。**メインループとサブエージェントを別立てにする**
 * （割り方の理由は `src/shared/token-usage.ts` の {@link TurnUsageBreakdown}）。
 *
 * ツールを1つも使わなかったターンでも**両方の持ち場が 0 で並ぶ** — 「無い」を型に持ち込まずに
 * 済み、あとから数える側が欄の有無を気にしなくてよい。
 */
export function turnUsageBreakdown(tally: TurnUsageTally): TurnUsageBreakdown {
  return { main: scopeUsage(tally, "main"), subagent: scopeUsage(tally, "subagent") }
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

function scopeUsage(tally: TurnUsageTally, scope: TurnUsageScope): ScopeUsage {
  const steps = tally.steps.filter((step) => step.scope === scope)
  return {
    steps: steps.length,
    tokens: steps.reduce((total, step) => addStepUsage(total, step.usage), EMPTY_STEP_USAGE),
    tools: foldToolCalls(tally.calls.filter((call) => call.scope === scope)),
  }
}

function addStepUsage(total: StepTokenUsage, usage: StepTokenUsage): StepTokenUsage {
  return {
    inputTokens: total.inputTokens + usage.inputTokens,
    outputTokens: total.outputTokens + usage.outputTokens,
    cacheReadInputTokens: total.cacheReadInputTokens + usage.cacheReadInputTokens,
    cacheCreationInputTokens: total.cacheCreationInputTokens + usage.cacheCreationInputTokens,
  }
}

/**
 * ツールの名前ごとに畳む。並びは**結果の長さの大きい順**（同じなら名前順）——行を読む人が
 * 「何が文脈を膨らませたか」を上から見て取れるようにする。
 */
function foldToolCalls(calls: readonly ToolCallTally[]): readonly ToolUsageCount[] {
  const names = [...new Set(calls.map((call) => call.name))]
  return names
    .map((name) => {
      const sameName = calls.filter((call) => call.name === name)
      return {
        name,
        calls: sameName.length,
        resultBytes: sameName.reduce((total, call) => total + call.resultBytes, 0),
      }
    })
    .sort((left, right) => right.resultBytes - left.resultBytes || compareName(left, right))
}

function compareName(left: ToolUsageCount, right: ToolUsageCount): number {
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0
}

/** ツールの結果の長さ（UTF-8 のバイト数）。物差しは雑談のログ（`src/shared/chat-log.ts`）と同じ。 */
function byteLength(text: string): number {
  return textEncoder.encode(text).length
}
