/**
 * `/` 補完に出すコマンド1件。
 * 説明は SDK 側が持っている（`init` の `slash_commands` は名前だけだが、`supportedCommands()` と `system` の `commands_changed` が名前と説明の組を返す）。
 * 組み込みコマンドも含めて説明が付くので、tsukumo 側に説明の表を持たない。説明が空文字のコマンドは `undefined` に倒す（名前だけ出す）。
 */
export type CommandDescription = {
  readonly name: string
  readonly description: string | undefined
}
