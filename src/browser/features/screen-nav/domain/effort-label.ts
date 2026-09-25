// effort の段（`src/shared/command.ts` の `EFFORT_LEVELS`）を、effort のドロップダウンが
// 受け取れる形にする。置き場の理由は `model-label.ts` の冒頭と同じ（読むのは
// `features/screen-nav/` だけ——帯（`hooks/use-screen-nav.ts`）と歯車の「新しいセッションの既定」
// （`hooks/use-settings.ts`）の両方、フックを呼ばない部品〔`components/ui/select.tsx`〕が読む対応表、
// 表示の整形はサーバとブラウザの契約ではない）。**選択肢と表示名は歯車も帯と同じものを使う**
// （`EFFORT_LABELS`/`effortLabel` を二重に持たない）。
//
// **effort だけ「まだ届いていない値」を見た目上の既定へ倒さない**（`model-label.ts` /
// `permission-mode-label.ts` と違う扱い。「読めない値は出さない」という決定は
// `docs/screen-design.md` 13.9「動き方の操作子」を参照）。読める口が `Stop` フック入力だけで、
// 起こした直後はまだ1件も読めていないため、「対応するモデルだが、まだ読めていない」を
// 独立した状態として持つ（`EffortSelect` の `unknown`）。

import { type EffortLevel, type ModelAlias } from "../../../../shared/command.ts"
import { type ModelEffortSupport } from "../../../../shared/session-event.ts"

/**
 * effort の値と、画面に出すラベル。**モデルと同じく機械が付けた値**（13.1 原則3。値そのものは
 * SDK の語彙で、人が選ぶ言葉に言い換えていない）。
 */
export const EFFORT_LABELS = [
  ["low", "Low"],
  ["medium", "Medium"],
  ["high", "High"],
  ["xhigh", "Xhigh"],
  ["max", "Max"],
] satisfies readonly (readonly [EffortLevel, string])[]

/** {@link EFFORT_LABELS} から日本語ではなく素の値のラベルを引く。無ければ値をそのまま返す。 */
export function effortLabel(value: EffortLevel): string {
  return EFFORT_LABELS.find(([level]) => level === value)?.[1] ?? value
}

/** モデルが effort に対応しないときの `title`（disabled の理由）。 */
export const EFFORT_UNSUPPORTED_REASON = "このモデルは effort に対応していない"

/** モデルは対応するが、まだ読めていないときの `title`。 */
export const EFFORT_UNKNOWN_REASON = "まだ effort を読み取れていない（ターンが終わると分かる）"

/**
 * effort が選べないとき（`EffortSelect` の `unsupported` / `unknown`）に `<select>` へ置く
 * 唯一の選択肢の値。帯（`screen-nav-model-permission.tsx`）と歯車
 * （`screen-nav-settings.tsx`）の両方が使うので、ここに1つだけ持つ。
 */
export const EFFORT_PLACEHOLDER_VALUE = ""

/**
 * effort のドロップダウンが受け取れる形（{@link resolveEffortSelect}）。帯と歯車の両方が使う。
 *
 * - `unsupported`: 対応表にいまのモデルの行があり、**対応しないと分かっている**（`haiku` など）。
 *   選べない
 * - `unknown`: 対応表がまだ届いていない・対応表に行が無い・**モデルは対応するがまだ1件も
 *   読めていない**（起こした直後、または直前の `set-effort` から次のターンが終わるまで）。
 *   選べない——**読めない値は出さない**
 * - `known`: 読み取った値がある。選べる段は `effortLevels`（いまのモデルが選べる段だけ）
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
 * いまのモデル・モデルごとの対応（`model-effort-support`）・読み取った effort から、
 * ドロップダウンが受け取れる形を決める。
 *
 * **「対応しない」と言い切るのは、対応表にいまのモデルの行があり、その行が対応しないと
 * 言っているときだけ**（`unsupported`）。**起動直後で対応表自体がまだ届いていない・
 * 対応表に行が無いときは「まだ分からない」**（`unknown`）——分かってもいないことを
 * 「対応しない」と出さない。
 *
 * **モデルを切り替えた直後、前に読んだ値がいまのモデルの選べる段に無ければ `unknown` に畳む**
 * （古いモデルの値を新しいモデルの選択肢として出さない）。
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
 * `support` からいまのモデルに当たる1件を探す。**まず完全一致、無ければ部分一致**
 * （`model-label.ts` の `resolveModelAlias` と逆向きの当て方）。
 *
 * **実測**: `supportedModels()` の `value` はエイリアスと一致するとは限らない——`opus` /
 * `sonnet` / `haiku` は一致するが、`fable` は `claude-fable-5-1` のような値になる
 * （`src/shared/session-event.ts` の `ModelEffortSupport` を参照）。
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
