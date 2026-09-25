// トークン消費を記録するときの判断（何を1行にするか）と、書き口の契約。**実際に書くのは
// `src/server/token-usage/adapter/token-usage-log.ts`** で、ここは「累計から増分を作る」
// 「ターンの中の内訳を積んで畳む」「期間で切って軸ごとに畳む（集計）」ところまでを持つ。
//
// **集計は純関数**（{@link summarizeTokenUsage}）で、ファイルに触らない。期間で切ったあとの
// 行を渡されて畳むだけなので、どの行を読むか（日付の範囲からファイルを選ぶ）は
// `src/server/token-usage/adapter/token-usage-log.ts` の仕事のまま（`core → adapter` は禁止。
// `test/architecture.test.ts`）。**分析の画面が引く口は
// {@link summarizeRecentTokenUsage}** で、こちらは読み口（{@link TokenUsageLog}）を受け取って
// 「今日を含む直近 n 日」に切る——**今日が何日かは呼ぶ側が渡す。**
//
// **集計の形（{@link TokenUsageSummary}）は `src/shared/token-usage-summary.ts`**（ブラウザも
// 同じ形を読むので shared に置いてある。配る経路の名前もそちら）。
//
// SDK の `result` に乗る `modelUsage` は **`query()` の中の累計**（サブエージェントと内部の
// 呼び出しも含む。`usage` のほうはメインループだけなので集計に使わない）。ターンごとの消費を
// 出すには前の `result` との差を取る必要があり、**前回の累計を覚えているのは
// {@link TokenUsageRecorder}**（駆動1代ぶんの持ち物として `session-manager.ts` が持つ。
// 変換だけの `sdk-message.ts` に前回値を置くとあのファイルの性格が変わる）。
//
// **数以外は通らない。** ツールの結果はここで**長さ（UTF-8 のバイト数）に畳んでから**積み、
// 本文は捨てる。依頼の文面もセリフもツールの引数もここには残らない
// （`docs/coding-standards.md`「会話内容の扱い」）。

import { byteLength } from "../../../shared/lib/byte-length.ts"
import { type SessionEvent } from "../../../shared/session-event.ts"
import { type SessionState } from "../../../shared/session-state.ts"
import {
  type ModelUsageTotal,
  type TokenUsageDays,
  type TokenUsageSummary,
  type TokenUsageTotals,
  type TokenUsageTrend,
  type TokenUsageTrendUnit,
} from "../../../shared/token-usage-summary.ts"
import {
  type ModelTokenUsage,
  type ScopeUsage,
  type TokenUsageMode,
  type StepTokenUsage,
  type ToolUsageCount,
  type TokenUsageRecord,
  type TurnUsageBreakdown,
  type TurnUsageScope,
} from "../../../shared/token-usage.ts"

/**
 * トークン消費の読み書き口（`chat-archive` と同じ形の契約）。**実装は `adapter` 側**
 * （`src/server/token-usage/adapter/token-usage-log.ts`）で、ここにあるのは契約だけ。
 *
 * 書けなくても例外を投げない（常駐プロセスは1回の失敗で落ちない。
 * `docs/coding-standards.md`「エラーハンドリング」）ので、受け付けたかどうかは返さない。
 */
export type TokenUsageLog = {
  readonly append: (entry: TokenUsageEntry) => void
  /**
   * 期間に入る行を、日付の範囲からファイルを選んで古い→新しい順に返す。**壊れた行・版が
   * 記録の形の版と違う行は読まずに落とす**（黙って飛ばして続ける。まだ開発中で、旧い版の行を
   * 残す価値が無いとユーザーが判断した）。
   */
  readonly readRange: (period: TokenUsagePeriod) => readonly TokenUsageRecord[]
}

/**
 * 集計の対象にする期間。**両端を含み、ローカル日付（`YYYY-MM-DD`）で表す** — 記録の `at` は
 * 書いた時点のローカル日付をそのまま持つ（`isoWithOffset`）ので、UTC へ変換し直さずに
 * 文字列のまま比較できる。**「今日」「今週」をここが決めるのではなく、呼ぶ側が渡す。**
 */
export type TokenUsagePeriod = {
  readonly startDate: string
  readonly endDate: string
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
 * 書き出し、{@link EMPTY_TURN_USAGE_TALLY} に戻す**（持ち主は {@link TokenUsageRecorder}）。
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

/** 畳む対象が無い（期間に入る記録が無い）ときの初期値。 */
const EMPTY_TOTALS = {
  inputTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  costUsd: 0,
} satisfies TokenUsageTotals

/** ターンの始まりの状態（何も積んでいない）。 */
export const EMPTY_TURN_USAGE_TALLY = { calls: [], steps: [] } satisfies TurnUsageTally

/**
 * 1代ぶんのトークン消費の勘定（**駆動1代ぶんの持ち物**で、起こし直すと作り直す）。前の
 * `result` が運んできた累計と、いま進んでいるターンの内訳を持ち、ターンごとに記録へ1行渡す。
 *
 * **起こし直すと `query()` が変わって累計も振り出しに戻る**ので、作り直すことがそのまま
 * 「前の累計を忘れる」になる（前の累計を引くと増分が足りなくなる）。
 */
export type TokenUsageRecorder = {
  /** ターンの中の内訳（ツール別・持ち場別）を1件積む。**駆動由来のイベントだけ**を渡す。 */
  readonly tally: (event: SessionEvent) => void
  /**
   * そのターンのトークン消費を記録に1行足す。**1行 = 1ターン**で、モデルが複数出たターン
   * （サブエージェントが別のモデルで動いたとき）は同じ行の `models` に並ぶ——ターンが読む人に
   * とっての単位なので、モデルごとに行を割ると「このターンでいくら使ったか」を出すのに行を
   * 組み直すことになる。
   *
   * 届く `cumulative` は `query()` の中の累計なので、**前回との差**を書く。増分が無いターン
   * （`/clear` の直後など、何も呼んでいない `result`）は行を書かないが、**累計は行を書かなくても
   * 必ず覚え直す**（次のターンの差が合わなくなるため）。
   *
   * 内訳は**そのターンのあいだ積んできたもの**を畳んで、合計の `models` と同じ1行に入れる
   * （割り方の理由は `src/shared/token-usage.ts`）。
   *
   * **claude 側のセッションIDが分からないうちは書かない**（`system/init` より前に `result` は
   * 来ないので実際には起きない）。行だけで「どのセッションのターンか」が決まらない記録を
   * 積まないため。
   */
  readonly append: (cumulative: readonly ModelTokenUsage[], at: number, state: SessionState) => void
  /** ターンの終わりに内訳を捨てる（**1ターンぶんだけ**持つ）。 */
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

/**
 * 期間に入る行を、**推移・モデル別・ツール別**の3つの軸で畳む（分析画面が要る軸だけ。
 * 使わない軸＝モード別・1ターンあたりの中央値は作らない）。
 *
 * **期間の判定は行の `at` の頭10文字（ローカル日付）で行う** — 記録は書いた時点のローカル日付を
 * 持つので（`isoWithOffset`）、ここで改めてタイムゾーンを変換し直さない。`readRange` が渡す
 * 行が既に期間の外を含んでいても、ここで確定的に切り直す。
 *
 * **推移の刻みは期間の長さが決める** — 1日なら時間ごと（0〜23時の24点）、それより長ければ
 * 日ごと。**穴は0で埋める**（棒の数と両端が期間から決まるので、描く側は点の数を数えるだけで
 * 済み、「今日が何日か」を知らずに端のラベルを出せる）。
 */
export function summarizeTokenUsage(
  records: readonly TokenUsageRecord[],
  period: TokenUsagePeriod,
): TokenUsageSummary {
  const withinPeriod = records.filter((record) => isWithinPeriod(record, period))
  return {
    trend: summarizeTrend(withinPeriod, period),
    byModel: summarizeByModel(withinPeriod),
    byTool: summarizeByTool(withinPeriod),
  }
}

/**
 * 「今日を含む直近 `days` 日」を期間にして、記録を読んで畳む（分析の画面が引く口）。
 *
 * **今日が何日かはここが決めない**（`endDate` を受け取る。OS のタイムゾーンに依るので、
 * 今日のローカル日付を作るのは `adapter/local-time.ts` の仕事）。**期間の両端を含む**ので、
 * 7日なら `endDate` の6日前から。
 */
export function summarizeRecentTokenUsage(
  log: TokenUsageLog,
  endDate: string,
  days: TokenUsageDays,
): TokenUsageSummary {
  const period = { startDate: shiftDate(endDate, -(days - 1)), endDate }
  return summarizeTokenUsage(log.readRange(period), period)
}

/**
 * ローカル日付（`YYYY-MM-DD`）を日数ぶんずらす。**時刻もタイムゾーンも持ち込まずに日付だけで
 * 数える**（`Temporal.PlainDate`）ので、夏時間のある地域でも同じ入力なら同じ境目になる。
 */
function shiftDate(date: string, days: number): string {
  return Temporal.PlainDate.from(date).add({ days }).toString()
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

/** 行のローカル日付が期間（両端含む）に入っているか。 */
function isWithinPeriod(record: TokenUsageRecord, period: TokenUsagePeriod): boolean {
  const date = localDateOf(record)
  return date >= period.startDate && date <= period.endDate
}

/** 行の `at` の頭10文字（ローカル日付）。ファイル名には頼らず、行だけで日付が決まる。 */
function localDateOf(record: TokenUsageRecord): string {
  return record.at.slice(0, 10)
}

/**
 * 行の `at` の11〜13文字目（ローカル時刻の時。`YYYY-MM-DDTHH:...` の `HH`）。**日付と同じく
 * 書いた時点のローカル時刻をそのまま読む**ので、ここでもタイムゾーンを変換し直さない。
 */
function localHourOf(record: TokenUsageRecord): string {
  return record.at.slice(11, 13)
}

/** 1日ぶんの時の鍵（`00`〜`23`）。 */
const HOUR_KEYS: readonly string[] = Array.from({ length: 24 }, (_, hour) =>
  String(hour).padStart(2, "0"),
)

/** 期間の刻み（1日だけの期間は時間ごと、それより長ければ日ごと）。 */
function trendUnitOf(period: TokenUsagePeriod): TokenUsageTrendUnit {
  return period.startDate === period.endDate ? "hour" : "day"
}

/** 期間の刻みごとに畳む。**期間のすべての刻みを並べ、記録の無い刻みは0で埋める。** */
function summarizeTrend(
  records: readonly TokenUsageRecord[],
  period: TokenUsagePeriod,
): TokenUsageTrend {
  const unit = trendUnitOf(period)
  const keyOf = unit === "hour" ? localHourOf : localDateOf
  return {
    unit,
    points: trendKeys(unit, period).map((key) => ({
      key,
      totals: sumTotals(records.filter((record) => keyOf(record) === key).flatMap((r) => r.models)),
    })),
  }
}

/** 期間に並ぶ刻みの鍵（古い→新しい順）。 */
function trendKeys(unit: TokenUsageTrendUnit, period: TokenUsagePeriod): readonly string[] {
  return unit === "hour" ? HOUR_KEYS : datesInPeriod(period)
}

/** 両端を含む日付の並び（`YYYY-MM-DD`）。 */
function datesInPeriod(period: TokenUsagePeriod): readonly string[] {
  const start = Temporal.PlainDate.from(period.startDate)
  const length = start.until(Temporal.PlainDate.from(period.endDate)).days + 1
  return Array.from({ length }, (_, offset) => start.add({ days: offset }).toString())
}

/**
 * モデルごとに畳む。並びは**出力の多い順**（同じならモデル名順）——「どのモデルが出力を
 * いちばん使ったか」が上から読める。
 */
function summarizeByModel(records: readonly TokenUsageRecord[]): readonly ModelUsageTotal[] {
  const allUsages = records.flatMap((record) => record.models)
  const models = [...new Set(allUsages.map((usage) => usage.model))]
  return models
    .map((model) => ({
      model,
      totals: sumTotals(allUsages.filter((usage) => usage.model === model)),
    }))
    .toSorted(
      (left, right) =>
        right.totals.outputTokens - left.totals.outputTokens || compareModelName(left, right),
    )
}

function compareModelName(left: ModelUsageTotal, right: ModelUsageTotal): number {
  return left.model < right.model ? -1 : left.model > right.model ? 1 : 0
}

/**
 * ツールごとに畳む。**メインループとサブエージェントの内訳を足し合わせる**（どちらが重いかは
 * 1行の中の `breakdown` を見れば分かるので、この軸では「何にいちばん使ったか」だけを見る）。
 * 並びは {@link foldToolCalls} と同じ「結果の長さの降順、同じなら名前順」。
 */
function summarizeByTool(records: readonly TokenUsageRecord[]): readonly ToolUsageCount[] {
  const calls = records.flatMap((record) => [
    ...record.breakdown.main.tools,
    ...record.breakdown.subagent.tools,
  ])
  const names = [...new Set(calls.map((call) => call.name))]
  return names
    .map((name) => {
      const sameName = calls.filter((call) => call.name === name)
      return {
        name,
        calls: sameName.reduce((total, call) => total + call.calls, 0),
        resultBytes: sameName.reduce((total, call) => total + call.resultBytes, 0),
      }
    })
    .sort((left, right) => right.resultBytes - left.resultBytes || compareName(left, right))
}

/** モデル別の数の並びを足し合わせる（費用は浮動小数の誤差が出るので {@link roundCost} で丸める）。 */
function sumTotals(usages: readonly ModelTokenUsage[]): TokenUsageTotals {
  return usages.reduce(
    (total, usage) => ({
      inputTokens: total.inputTokens + usage.inputTokens,
      outputTokens: total.outputTokens + usage.outputTokens,
      thinkingTokens: total.thinkingTokens + usage.thinkingTokens,
      cacheReadInputTokens: total.cacheReadInputTokens + usage.cacheReadInputTokens,
      cacheCreationInputTokens: total.cacheCreationInputTokens + usage.cacheCreationInputTokens,
      costUsd: roundCost(total.costUsd + usage.costUsd),
    }),
    EMPTY_TOTALS,
  )
}
