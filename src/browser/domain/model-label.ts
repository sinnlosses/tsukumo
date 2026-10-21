// Claude Code のモデルのエイリアス（`MODEL_ALIASES`）を、画面に出す日本語ラベルにする。

import type { ModelAlias } from "../../shared/command.ts"
import { sameModel } from "../../shared/session/model-name.ts"
import { BUILTIN_SESSION_DEFAULT } from "../../shared/session/session-default.ts"
import type { ModelEffortSupport } from "../../shared/session/session-event-setting.ts"

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
type ModelDescription = {
  readonly summary: string
  readonly weight: number
}

/** 並びは `MODEL_LABELS` と同じ重い順。`weight` が大きいほど狐火の●を多く灯す。 */
const MODEL_DESCRIPTIONS = [
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
 * `session-info` の `model` から、画面に出すモデルを決める。
 * 表で同じモデルに引けるエイリアスがあればそれ、無ければ届いた名前のまま返す。
 * まだ届いていないときだけ既定のモデルを返す。
 */
export function resolveShownModel(
  model: string | undefined,
  support: readonly ModelEffortSupport[],
): string {
  if (model === undefined) {
    return BUILTIN_SESSION_DEFAULT.model
  }

  return MODEL_LABELS.find(([alias]) => sameModel(support, model, alias))?.[0] ?? model
}

export function modelLabel(name: string): string {
  return MODEL_LABELS.find(([alias]) => alias === name)?.[1] ?? name
}
