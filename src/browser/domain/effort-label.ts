// effort の段（`EFFORT_LEVELS`）を、effort のドロップダウンが受け取れる形にする。
// 選択肢と表示名は帯と歯車の「新しいセッションの既定」が同じものを使う。
//
// effort だけ「まだ届いていない値」を見た目上の既定へ倒さない。
// 値が届くまでを「対応するモデルだが、まだ分からない」という独立した状態として持つ（`EffortSelect` の `unknown`）。

import type { EffortLevel, ModelAlias } from "../../shared/command.ts"
import type { ModelEffortSupport } from "../../shared/session/session-event.ts"

/** effort の値と、画面に出すラベル。値そのものは SDK の語彙で、人が選ぶ言葉に言い換えていない。 */
export const EFFORT_LABELS = [
  ["low", "Low"],
  ["medium", "Medium"],
  ["high", "High"],
  ["xhigh", "Xhigh"],
  ["max", "Max"],
] satisfies readonly (readonly [EffortLevel, string])[]

/** 無ければ値をそのまま返す。 */
export function effortLabel(value: EffortLevel): string {
  return EFFORT_LABELS.find(([level]) => level === value)?.[1] ?? value
}

/** モデルが effort に対応しないときの `title`（disabled の理由）。 */
const EFFORT_UNSUPPORTED_REASON = "このモデルは effort に対応していない"

/** モデルは対応するが、まだ読めていないときの `title`。 */
const EFFORT_UNKNOWN_REASON = "まだ effort が分からない"

/** effort が選べないとき（`EffortSelect` の `unsupported` / `unknown`）に `<select>` へ置く唯一の選択肢の値。 */
export const EFFORT_PLACEHOLDER_VALUE = ""

/** モデルの吊り札の行に添える、effort に対応しない旨。 */
export const EFFORT_UNSUPPORTED_NOTE = "effort なし"

/**
 * モデルの吊り札の行に「effort なし」を添えるかどうか。
 * 対応表にそのモデルの行があり、対応しないと分かっているときだけ `EFFORT_UNSUPPORTED_NOTE` を返す。
 * 対応表がまだ届いていない・行が無いときは、分かってもいないことを言わず `undefined` を返す。
 */
export function modelEffortNote(
  model: ModelAlias,
  support: readonly ModelEffortSupport[],
): string | undefined {
  const entry = findModelEffortSupport(support, model)
  return entry !== undefined && !entry.supportsEffort ? EFFORT_UNSUPPORTED_NOTE : undefined
}

/**
 * effort のドロップダウンが受け取れる形（{@link resolveEffortSelect}）。
 *
 * - `unsupported`: 対応表にいまのモデルの行があり、対応しないと分かっている（`haiku` など）。選べない
 * - `unknown`: 対応表がまだ届いていない・対応表に行が無い・モデルは対応するがまだ値が届いていない、またはモデルを切り替えて前の値が選べる段に無い。選べない
 * - `known`: 読み取った値がある。選べる段は `options`（いまのモデルが選べる段だけ）
 */
export type EffortSelect =
  | { readonly kind: "unsupported"; readonly reason: string }
  | { readonly kind: "unknown"; readonly reason: string }
  | {
      readonly kind: "known"
      readonly value: EffortLevel
      readonly options: readonly EffortLevel[]
    }

/**
 * いまのモデル・モデルごとの対応・読み取った effort から、ドロップダウンが受け取れる形を決める。
 *
 * 「対応しない」と言い切るのは、対応表にいまのモデルの行があり、その行が対応しないと言っているときだけ。
 * 対応表自体がまだ届いていない・行が無いときは `unknown` にし、分かってもいないことを「対応しない」と出さない。
 *
 * モデルを切り替えた直後、前に読んだ値がいまのモデルの選べる段に無ければ `unknown` に畳む（古いモデルの値を新しいモデルの選択肢として出さない）。
 */
export function resolveEffortSelect(
  model: ModelAlias,
  support: readonly ModelEffortSupport[],
  effort: EffortLevel | undefined,
): EffortSelect {
  const entry = findModelEffortSupport(support, model)
  if (entry === undefined) {
    return { kind: "unknown", reason: EFFORT_UNKNOWN_REASON }
  }
  if (!entry.supportsEffort || entry.effortLevels.length === 0) {
    return { kind: "unsupported", reason: EFFORT_UNSUPPORTED_REASON }
  }
  if (effort === undefined || !entry.effortLevels.includes(effort)) {
    return { kind: "unknown", reason: EFFORT_UNKNOWN_REASON }
  }
  return { kind: "known", value: effort, options: entry.effortLevels }
}

/**
 * `support` からいまのモデルに当たる1件を探す。まず完全一致、無ければ部分一致。
 *
 * 実測: `supportedModels()` の `value` はエイリアスと一致するとは限らない。
 * `opus` / `sonnet` / `haiku` は一致するが、`fable` は `claude-fable-5-1` のような値になる。
 */
function findModelEffortSupport(
  support: readonly ModelEffortSupport[],
  model: ModelAlias,
): ModelEffortSupport | undefined {
  return (
    support.find((entry) => entry.model === model) ??
    support.find((entry) => entry.model.includes(model))
  )
}
