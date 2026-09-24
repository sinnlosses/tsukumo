// Claude Code のモデルのエイリアス（`src/shared/command.ts` の `MODEL_ALIASES`）を、画面に出す
// 日本語ラベルにする。**読むのは帯（`features/screen-nav/`）だけ**——操作子も読みも帯へ集まったので、
// 機能の中に置く（`docs/design.md` 2章「その機能しか読まないなら機能の中」）。
//
// 機能の中の `domain/` なのは、**フックを呼ばない相手（`components/` の `<select>` と札）が読む**
// 対応表だから（同2章「機能の中を分ける」）。**表示の整形はサーバとブラウザの契約ではない**ので
// `shared` には置かない（`shared/command.ts`「画面に出す日本語ラベルは描く側が持つ」）。

import { type ModelAlias } from "../../../../shared/command.ts"
import { BUILTIN_SESSION_DEFAULT } from "../../../../shared/session-default.ts"

/**
 * モデルのエイリアスと、日本語ラベル。**並びは重い順**（Fable は Opus の上の階層なので先頭）で、
 * そのまま `<select>` に出す順になる。値は `MODEL_ALIASES` と同じ4つ。
 */
export const MODEL_LABELS = [
  ["fable", "Fable"],
  ["opus", "Opus"],
  ["sonnet", "Sonnet"],
  ["haiku", "Haiku"],
] satisfies readonly (readonly [ModelAlias, string])[]

/**
 * `session-info` の `model`（フルネームや実装依存の識別子）から、画面で扱うエイリアスを決める。
 * **部分一致**にしてあるのは、フルネームの形（`claude-opus-4-1` のような値）が実装側の都合で
 * 変わりうるため。**まだ届いていない・対応しないときは既定へ畳む**ので、呼んだ側は
 * 「必ず値がある」型で受け取れる。
 */
export function resolveModelAlias(model: string | undefined): ModelAlias {
  if (model === undefined) {
    return BUILTIN_SESSION_DEFAULT.model
  }

  return MODEL_LABELS.find(([alias]) => model.includes(alias))?.[0] ?? BUILTIN_SESSION_DEFAULT.model
}
