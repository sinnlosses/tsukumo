// Claude Code のモデルのエイリアス（`MODEL_ALIASES`）を、画面に出す日本語ラベルにする。

import type { ModelAlias } from "../../shared/command.ts"
import { BUILTIN_SESSION_DEFAULT } from "../../shared/session/session-default.ts"

/**
 * モデルのエイリアスと、日本語ラベル。
 * 並びは重い順（Fable は Opus の上の階層なので先頭）で、そのまま `<select>` に出す順になる。
 */
export const MODEL_LABELS = [
  ["fable", "Fable"],
  ["opus", "Opus"],
  ["sonnet", "Sonnet"],
  ["haiku", "Haiku"],
] satisfies readonly (readonly [ModelAlias, string])[]

/** モデルの吊り札の行に出す、1行の用途と重さ（狐火の●の数）。 */
export type ModelDescription = {
  readonly summary: string
  readonly weight: number
}

/** 並びは `MODEL_LABELS` と同じ重い順。`weight` が大きいほど狐火の●を多く灯す。 */
export const MODEL_DESCRIPTIONS = [
  ["fable", { summary: "いちばん難しい判断に", weight: 4 }],
  ["opus", { summary: "難しい判断に", weight: 3 }],
  ["sonnet", { summary: "ふだんの作業に", weight: 2 }],
  ["haiku", { summary: "速い雑用に", weight: 1 }],
] satisfies readonly (readonly [ModelAlias, ModelDescription])[]

/** 無ければ空の用途・重さ0を返す。 */
export function modelDescription(model: ModelAlias): ModelDescription {
  return MODEL_DESCRIPTIONS.find(([alias]) => alias === model)?.[1] ?? { summary: "", weight: 0 }
}

/**
 * `session-info` の `model`（フルネームや実装依存の識別子）から、画面で扱うエイリアスを決める。
 * 部分一致にしてあるのは、フルネームの形（`claude-opus-4-1` のような値）が実装側の都合で変わりうるため。
 * まだ届いていない・対応しないときは既定へ畳む。
 */
export function resolveModelAlias(model: string | undefined): ModelAlias {
  if (model === undefined) {
    return BUILTIN_SESSION_DEFAULT.model
  }

  return MODEL_LABELS.find(([alias]) => model.includes(alias))?.[0] ?? BUILTIN_SESSION_DEFAULT.model
}
