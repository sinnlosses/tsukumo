// E2E の期待値の撮り直しの入口に渡された引数を読み、撮り直しの対象の種類を決める。
// `--` は区切りなので捨てる。`--full` 以外の `-` で始まる引数は、知らないフラグとして止める。

/** 撮り直しの引数の読み。`changed` は引数が無く、変えたファイルから選ぶ。 */
export type E2eUpdateArgument =
  | { readonly kind: "help" }
  | { readonly kind: "unknown"; readonly flags: readonly string[] }
  | { readonly kind: "full" }
  | { readonly kind: "files"; readonly files: readonly string[] }
  | { readonly kind: "changed" }

export function readE2eUpdateArgument(args: readonly string[]): E2eUpdateArgument {
  const words = args.filter((arg) => arg !== "--")
  if (words.some((arg) => arg === "--help" || arg === "-h")) {
    return { kind: "help" }
  }
  const flags = words.filter((arg) => arg.startsWith("-") && arg !== "--full")
  if (flags.length > 0) {
    return { kind: "unknown", flags }
  }
  if (words.includes("--full")) {
    return { kind: "full" }
  }
  const files = words.filter((arg) => !arg.startsWith("-"))
  return files.length > 0 ? { kind: "files", files } : { kind: "changed" }
}
