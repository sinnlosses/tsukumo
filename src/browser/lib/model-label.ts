// Claude Code のモデルのエイリアス（`src/shared/command.ts` の `MODEL_ALIASES`）を、画面に出す
// 日本語ラベルにする。**サイドバーの `<select>`（`features/sidebar/session-info.tsx`）と
// 帯の読み（`features/screen-nav/`）の両方が読む**ので、機能をまたぐ道具として `browser/lib/` に
// 置く（`docs/design.md` 2章。**機能どうしの import は増やさない**）。
//
// `lib/` なのは、名前が指すのが tsukumo の語彙ではなく**外部システム（Claude Code）の語彙**だから
// （`browser/lib/tool-summary.ts` と同じ理由）。**表示の整形はサーバとブラウザの契約ではない**ので
// `shared` には置かない（`shared/command.ts`「画面に出す日本語ラベルは描く側が持つ」）。

import { type ModelAlias } from "../../shared/command.ts"

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
    return MODEL_FALLBACK
  }

  return MODEL_LABELS.find(([alias]) => model.includes(alias))?.[0] ?? MODEL_FALLBACK
}

/** 画面に出すモデルの日本語ラベル（一覧に無い値は来ない — 引数が畳んだあとの型）。 */
export function modelLabel(alias: ModelAlias): string {
  return MODEL_LABELS.find(([value]) => value === alias)?.[1] ?? alias
}

/**
 * `model` がまだ届いていない、またはエイリアスと対応しないときの見た目上の既定値。値は
 * `src/server/core/session-driver.ts` の DEFAULT_MODEL と同じ（`opus`）。
 */
const MODEL_FALLBACK: ModelAlias = "opus"
