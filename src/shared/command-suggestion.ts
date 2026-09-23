// 入力欄の `/` 補完に出す候補。**セッションの姿（`session-state.ts`）から導くだけの純粋関数**で、
// 状態そのものは持たない（`docs/display.md` 4.2「入力欄」）。
//
// 出どころは2つある: `init` で届く名前の一覧（`SessionState.slashCommands`）と、駆動が起動直後に
// 取りに行く説明付きの一覧（`SessionState.commandDescriptions`）。**どちらを名前の出どころに
// するかの判断がここの仕事**で、畳み込み（`applySessionEvent`）は `init` の値を
// {@link commandCandidates} で絞ってから持つ。
//
// **受け取るのは姿まるごとではなくその2つ**（入力欄は他のフィールドの変化で描き直したくない。
// `mainViewTurns` が記録ではなく畳んだ結果を受け取るのと同じ絞り方）。
//
// `node:` にも `document` にも触らない（他の shared と同じ制約）。

import { type CommandDescription } from "./session-event.ts"

/**
 * 入力欄の `/` 補完に出す候補（名前と、あれば説明）。
 *
 * `slashCommands`（`init` 由来）が届いていればそれが並びの出どころで、`commandDescriptions` は
 * 同じ名前のものを引き当てるためだけに使う（説明が届いていない・説明を持たないコマンドは
 * `description` が undefined になり、名前だけで出る）。
 *
 * **`slashCommands` がまだ空（`init` が届く前）は `commandDescriptions` をそのまま名前の出どころに
 * する。** `supportedCommands()` は `init` を待たずに届くため、これで最初の依頼を送る前でも
 * 候補が出せる（実測。docs/display.md 4.2）。ただしこの間は端末専用
 * （`doctor` など）の除外がまだ効かない。**`init` が届き `slashCommands` が埋まった時点で、
 * 除外込みの一覧に戻る**ので、常駐セッションが長引くほど気にならない一時的な差分と割り切る。
 */
export function commandSuggestions(
  slashCommands: readonly string[],
  commandDescriptions: readonly CommandDescription[],
): readonly CommandDescription[] {
  if (slashCommands.length === 0) {
    return commandDescriptions
  }

  const descriptions = new Map(
    commandDescriptions.map((command) => [command.name, command.description]),
  )
  return slashCommands.map((name) => ({ name, description: descriptions.get(name) }))
}

/**
 * 入力欄の `/` 補完に出せるコマンド名。`slashCommands` から端末専用
 * （`terminalSlashCommands`。`doctor` / `color` / `reload-plugins` など）を除く
 * （docs/display.md 4.2「入力欄」）。
 */
export function commandCandidates(
  slashCommands: readonly string[],
  terminalSlashCommands: readonly string[],
): readonly string[] {
  const terminalOnly = new Set(terminalSlashCommands)
  return slashCommands.filter((command) => !terminalOnly.has(command))
}
