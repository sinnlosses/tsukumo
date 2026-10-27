// git の語の並びから、大域オプションを飛ばしてサブコマンドとその引数を取り出す。

import type { ShellWord } from "./shell-command.ts"

/** git のオプションのうち、次の語を値として取るもの。 */
const GIT_VALUE_OPTIONS: ReadonlySet<string> = new Set(["-C", "-c", "--git-dir", "--work-tree"])

export function splitGitArguments(words: readonly ShellWord[]): {
  readonly subcommand: string | undefined
  readonly args: readonly string[]
} {
  const texts = words.map((word) => word.text)
  let index = 0
  while (index < texts.length && (texts[index] ?? "").startsWith("-")) {
    index += GIT_VALUE_OPTIONS.has(texts[index] ?? "") ? 2 : 1
  }
  return { subcommand: texts[index], args: texts.slice(index + 1) }
}

/** `--dry-run` か、`n` を含む短いオプションの束（`-n`・`-fn` など）。 */
export function isGitDryRunOption(text: string): boolean {
  return text === "--dry-run" || /^-[a-zA-Z]*n[a-zA-Z]*$/.test(text)
}
