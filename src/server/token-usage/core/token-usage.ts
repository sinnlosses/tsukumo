// トークン消費を記録するときの判断（何を1行にするか）と、書き口・読み口の契約。
// ここは「累計から増分を作る」「ターンの中の内訳を積んで畳む」ところまでを持つ。
//
// SDK の `result` に乗る `modelUsage` は `query()` の中の累計（サブエージェントと内部の呼び出しも含む）。
// `usage` のほうはメインループだけなので使わない。
// ターンごとの消費を出すには前の `result` との差を取る必要があり、前回の累計を覚えているのは `TokenUsageRecorder`（駆動1代ぶんの持ち物）。
//
// 数以外は通らない。ツールの結果はここで長さ（UTF-8 のバイト数）に畳んでから積み、本文は捨てる。
// 依頼の文面もセリフもツールの引数もここには残らない。

import { groupBy, prop, sortBy, sumBy } from "remeda"

import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type { SessionState } from "../../../shared/session/session-state.ts"
import type {
  ModelTokenUsage,
  ScopeUsage,
  TokenUsageMode,
  StepTokenUsage,
  ToolUsageCount,
  TokenUsageRecord,
  TurnUsageBreakdown,
  TurnUsageScope,
} from "../../../shared/token-usage/token-usage.ts"
import { byteLength } from "../../../shared/utils/byte-length.ts"

/** トークン消費の読み書き口。書けなくても例外を投げず、受け付けたかどうかは返さない。 */
export type TokenUsageLog = {
  readonly append: (entry: TokenUsageEntry) => void
  /**
   * 期間に入る行を、日付の範囲からファイルを選んで古い→新しい順に返す。
   * 壊れた行・版が記録の形の版と違う行は読まずに落とす（黙って飛ばして続ける）。
   */
  readonly readRange: (period: TokenUsagePeriod) => readonly TokenUsageRecord[]
}

/**
 * 集計の対象にする期間。両端を含み、ローカル日付（`YYYY-MM-DD`）で表す。
 * 記録の `at` は書いた時点のローカル日付をそのまま持つ（`isoWithOffset`）ので、UTC へ変換し直さずに文字列のまま比較できる。
 * 「今日」「今週」をここが決めるのではなく、呼ぶ側が渡す。
 */
export type TokenUsagePeriod = {
  readonly startDate: string
  readonly endDate: string
}

/**
 * 1ターンぶんの記録（書き出す行そのものではない）。
 * `at` はエポックミリ秒で、ISO 8601 への変換と日付ごとのファイルの選択は `adapter` 側の仕事。
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
 * ターンの途中で積み上げる内訳の入れ物。
 * ターンの終わりに {@link turnUsageBreakdown} で畳んで書き出し、{@link EMPTY_TURN_USAGE_TALLY} に戻す（持ち主は {@link TokenUsageRecorder}）。
 *
 * ここに文面は入らない（ツールの結果は受け取った時点で長さに畳む）。
 */
type TurnUsageTally = {
  /** 始まったツールの呼び出し1件ずつ（結果の長さを足す先を `toolUseId` で引くため）。 */
  readonly calls: readonly ToolCallTally[]
  /** assistant のステップの使用量。同じ `messageId` は最後の1つだけが残る。 */
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

/** ターンの始まりの状態（何も積んでいない）。 */
const EMPTY_TURN_USAGE_TALLY = { calls: [], steps: [] } satisfies TurnUsageTally

/**
 * 1代ぶんのトークン消費の勘定（駆動1代ぶんの持ち物で、起こし直すと作り直す）。
 * 前の `result` が運んできた累計と、いま進んでいるターンの内訳を持ち、ターンごとに記録へ1行渡す。
 *
 * 起こし直すと `query()` が変わって累計も振り出しに戻るので、作り直すことがそのまま「前の累計を忘れる」になる（前の累計を引くと増分が足りなくなる）。
 */
export type TokenUsageRecorder = {
  /** ターンの中の内訳（ツール別・持ち場別）を1件積む。駆動由来のイベントだけを渡す。 */
  readonly tally: (event: SessionEvent) => void
  /**
   * そのターンのトークン消費を記録に1行足す。
   * 1行 = 1ターンで、モデルが複数出たターン（サブエージェントが別のモデルで動いたとき）は同じ行の `models` に並ぶ。
   * モデルごとに行を割ると「このターンでいくら使ったか」を出すのに行を組み直すことになる。
   *
   * 届く `cumulative` は `query()` の中の累計なので、前回との差を書く。
   * 増分が無いターン（`/clear` の直後など、何も呼んでいない `result`）は行を書かないが、累計は行を書かなくても必ず覚え直す（次のターンの差が合わなくなるため）。
   *
   * 内訳はそのターンのあいだ積んできたものを畳んで、合計の `models` と同じ1行に入れる。
   *
   * claude 側のセッションIDが分からないうちは書かない（行だけで「どのセッションのターンか」が決まらない記録を積まないため）。
   * `system/init` より前に `result` は来ないので、実際には起きない。
   */
  readonly append: (cumulative: readonly ModelTokenUsage[], at: number, state: SessionState) => void
  /** ターンの終わりに内訳を捨てる（1ターンぶんだけ持つ）。 */
  readonly finishTurn: () => void
}

/** {@link TokenUsageRecorder} を1代ぶん起こす（書き口はそのまま渡す）。 */
export function createTokenUsageRecorder(log: TokenUsageLog): TokenUsageRecorder {
  // 前の `result` が運んできたトークンの累計（`query()` の中の走行合計）。
  let cumulativeTokenUsage: readonly ModelTokenUsage[] = []
  // いま進んでいるターンの内訳（ツールの呼び出し回数と結果の長さ、ステップの使用量）。
  let turnUsage: TurnUsageTally = EMPTY_TURN_USAGE_TALLY

  return {
    tally: (event) => {
      turnUsage = tallyTurnUsage(turnUsage, event)
    },
    append: (cumulative, at, state) => {
      const models = tokenUsageDelta(cumulativeTokenUsage, cumulative)
      cumulativeTokenUsage = cumulative
      const sessionId = state.session.kind === "starting" ? undefined : state.session.sessionId
      if (models.length === 0 || sessionId === undefined) {
        return
      }
      log.append({
        at,
        sessionId,
        mode: state.chatMode ? "chat" : "work",
        models,
        breakdown: turnUsageBreakdown(turnUsage),
      })
    },
    finishTurn: () => {
      turnUsage = EMPTY_TURN_USAGE_TALLY
    },
  }
}

/**
 * 前の `result` の累計と今の累計から、そのターンの増分を作る。
 *
 * - 増えていないモデルは返さない（0 だけの行を積まない）。すべてのモデルが増えていなければ空の並びになり、呼ぶ側は行を書かない
 * - 累計が振り出しに戻ったモデルは、いまの累計をそのまま増分にする（負を書かない）。起こし直し（resume）とターンの途中の `/clear` で走行合計がリセットされると SDK の型定義が言っている。1つでも数が減っていたらリセットとみなす（一部だけ引くと、残りの数が実際より大きい増分になる）
 * - 前の累計にしか無いモデルは落とす（そのターンで使われていない）
 *
 * `costUsd` は引き算で浮動小数の誤差が出る（`0.7 - 0.5` が `0.19999999999999996` になる）ので、小数10桁で丸めてから返す。
 * これより細かい桁は SDK 側の値にも無い。
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
 * イベント1件を内訳に積む。見るのは3種類だけで、他のイベントはそのまま返す。
 *
 * - `tool-started`: 呼び出しを1件足す（始まった時点で数える。結果が返らずにターンが終わった呼び出しも「使った」ことは変わらない）。持ち場は `parentToolUseId` で決まる
 * - `tool-finished`: 結果の長さだけを、同じ `toolUseId` の呼び出しに足す。本文は捨てる
 * - `step-usage`: 同じ `messageId` の古いぶんを捨てて置き換える。返答が流れている間は同じ `message.id` の `assistant` が何度も届き、途中の `usage` は確定値ではないので（`sdk.d.ts`）、最後に届いたものだけを残す
 */
function tallyTurnUsage(tally: TurnUsageTally, event: SessionEvent): TurnUsageTally {
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
 * 積み上げた内訳を、記録に書く形に畳む。メインループとサブエージェントを別立てにする。
 * ツールを1つも使わなかったターンでも両方の持ち場が 0 で並ぶ（あとから数える側が欄の有無を気にしなくてよい）。
 */
function turnUsageBreakdown(tally: TurnUsageTally): TurnUsageBreakdown {
  return { main: scopeUsage(tally, "main"), subagent: scopeUsage(tally, "subagent") }
}

/** 費用は浮動小数の誤差が出るので、足し引きのあとにここで丸める。 */
export function roundCost(value: number): number {
  return Math.round(value * 1e10) / 1e10
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
 * ツールの名前ごとに畳む。並びは結果の長さの大きい順（同じなら名前順）。
 * 行を読む人が「何が文脈を膨らませたか」を上から見て取れるようにする。
 */
function foldToolCalls(calls: readonly ToolCallTally[]): readonly ToolUsageCount[] {
  const byName = groupBy(calls, prop("name"))
  return sortBy(
    Object.entries(byName).map(([name, sameName]) => ({
      name,
      calls: sameName.length,
      resultBytes: sumBy(sameName, prop("resultBytes")),
    })),
    [prop("resultBytes"), "desc"],
    prop("name"),
  )
}
