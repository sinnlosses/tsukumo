// 入力欄の `/` 補完に出す候補。セッションの姿から導くだけで、状態そのものは持たない。
//
// 出どころは2つある。
// `init` で届く名前の一覧（`SessionState.slashCommands`）と、駆動が起動直後に取りに行く説明付きの一覧（`SessionState.commandDescriptions`）。
// どちらを名前の出どころにするかの判断がここの仕事で、畳み込みは `init` の値を `commandCandidates` で絞ってから持つ。
//
// 受け取るのは姿まるごとではなくその2つ（入力欄を他のフィールドの変化で描き直さないため）。

import type { CommandDescription } from "./session-event.ts"

/**
 * 入力欄の `/` 補完に出す候補（名前と、あれば説明）。
 *
 * `slashCommands`（`init` 由来）が届いていればそれが並びの出どころで、`commandDescriptions` は同じ名前のものを引き当てるためだけに使う
 * （説明が届いていない・説明を持たないコマンドは `description` が undefined になり、名前だけで出る）。
 *
 * `slashCommands` がまだ空（`init` が届く前）は `commandDescriptions` をそのまま名前の出どころにする。
 * `supportedCommands()` は `init` を待たずに届くため（実測）、これで最初の依頼を送る前でも候補が出せる。
 * ただしこの間は端末専用（`doctor` など）の除外がまだ効かず、`init` が届いた時点で除外込みの一覧に戻る。
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

/** 入力欄の `/` 補完に出せるコマンド名。`slashCommands` から端末専用（`terminalSlashCommands`。`doctor` / `color` / `reload-plugins` など）を除く。 */
export function commandCandidates(
  slashCommands: readonly string[],
  terminalSlashCommands: readonly string[],
): readonly string[] {
  const terminalOnly = new Set(terminalSlashCommands)
  return slashCommands.filter((command) => !terminalOnly.has(command))
}
