// shell の塊の行を、コマンドと出力に分ける。`$ ` で始まる行がコマンド、それ以外が出力。

export type ShellLineKind = "command" | "output"

const SHELL_LANGUAGES: readonly string[] = ["bash", "sh", "zsh", "console", "shell"]

const COMMAND_PREFIX = "$ "

/**
 * 行ごとの種別。shell の言語でない・`$ ` で始まる行が 1 つも無いときは `undefined`（分けない）。
 * 行末が `\` のコマンドの次の行は、続きなのでコマンドに数える。
 */
export function shellLineKinds(
  language: string | undefined,
  source: string,
): readonly ShellLineKind[] | undefined {
  if (language === undefined || !SHELL_LANGUAGES.includes(language)) {
    return undefined
  }
  const rows = source.split("\n")
  const kinds = rows.reduce<readonly ShellLineKind[]>((previous, line, index) => {
    const continued = previous.at(-1) === "command" && (rows[index - 1] ?? "").endsWith("\\")
    return [...previous, line.startsWith(COMMAND_PREFIX) || continued ? "command" : "output"]
  }, [])
  return kinds.includes("command") ? kinds : undefined
}

/** コマンドの行だけを、頭の `$ ` を外して改行で連ねる。 */
export function shellCommandText(source: string, kinds: readonly ShellLineKind[]): string {
  return source
    .split("\n")
    .filter((_, index) => kinds[index] === "command")
    .map((line) => (line.startsWith(COMMAND_PREFIX) ? line.slice(COMMAND_PREFIX.length) : line))
    .join("\n")
}
