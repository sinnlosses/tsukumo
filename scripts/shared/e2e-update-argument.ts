// E2E の期待値の撮り直しの入口に渡された引数を読み、撮り直しの対象の種類を決める。
// `--full` と `--help`（`-h`）以外のフラグは、知らないフラグとして止める。

import { parseArgs } from "node:util"

/** 撮り直しの引数の読み。`changed` は引数が無く、変えたファイルから選ぶ。 */
export type E2eUpdateArgument =
  | { readonly kind: "help" }
  | { readonly kind: "unknown"; readonly flags: readonly string[] }
  | { readonly kind: "full" }
  | { readonly kind: "files"; readonly files: readonly string[] }
  | { readonly kind: "changed" }

export function readE2eUpdateArgument(args: readonly string[]): E2eUpdateArgument {
  const flags = args.filter((arg) => arg.startsWith("-") && arg !== "--")
  const known = parseKnownFlags(args.filter((arg) => arg !== "--"))
  if (known?.values.help === true) {
    return { kind: "help" }
  }
  if (known === undefined) {
    return { kind: "unknown", flags: flags.filter((flag) => !KNOWN_FLAGS.has(flag)) }
  }
  if (known.values.full === true) {
    return { kind: "full" }
  }
  return known.positionals.length > 0
    ? { kind: "files", files: known.positionals }
    : { kind: "changed" }
}

const KNOWN_FLAGS: ReadonlySet<string> = new Set(["--full", "--help", "-h"])

function parseKnownFlags(args: readonly string[]) {
  try {
    return parseArgs({
      args: [...args],
      strict: true,
      allowPositionals: true,
      options: { full: { type: "boolean" }, help: { type: "boolean", short: "h" } },
    })
  } catch {
    return undefined
  }
}
