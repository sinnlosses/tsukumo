// Claude Code のモデルのエイリアス（`MODEL_ALIASES`）を、画面に出す日本語ラベルにする。

import type { ModelAlias } from "../../../../../shared/command.ts"
import { BUILTIN_SESSION_DEFAULT } from "../../../../../shared/session/session-default.ts"

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
