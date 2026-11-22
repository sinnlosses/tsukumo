// タスクの再試の開発用スクリプトが受ける引数。
// 再試は `--tasks <ID,…> --k <n>`、版の比較は `--baseline <path,…> --candidate <path,…>`。
import { parseArgs } from "node:util"

import { positiveIntegerArgument } from "./positive-integer-argument.ts"

export type ReplayOptions = {
  readonly tasks: readonly string[]
  readonly k: number
  readonly brief?: string
  readonly out?: string
}

export type ReplayCompareOptions = {
  readonly baseline: readonly string[]
  readonly candidate: readonly string[]
}

/**
 * コマンドラインから `--tasks`・`--k`・`--brief`・`--out` を読む。
 * `--tasks` は必須、`--k` の既定は2、`--brief`・`--out` は省ける。崩れていれば `"invalid"`。
 */
export function parseReplayOptions(argv: readonly string[]): ReplayOptions | "invalid" {
  try {
    const { values } = parseArgs({
      args: withoutLeadingSeparator(argv),
      strict: true,
      options: {
        tasks: { type: "string" },
        k: { type: "string" },
        brief: { type: "string" },
        out: { type: "string" },
      },
    })
    const tasks = splitList(values.tasks)
    const k = positiveIntegerArgument.default(2).safeParse(values.k)
    const pathsValid = values.brief !== "" && values.out !== ""
    return tasks.length > 0 && k.success && pathsValid
      ? { tasks, k: k.data, brief: values.brief, out: values.out }
      : "invalid"
  } catch {
    return "invalid"
  }
}

/** コマンドラインから `--baseline`・`--candidate`（どちらも必須・カンマ区切りのパス）を読む。崩れていれば `"invalid"`。 */
export function parseReplayCompareOptions(
  argv: readonly string[],
): ReplayCompareOptions | "invalid" {
  try {
    const { values } = parseArgs({
      args: withoutLeadingSeparator(argv),
      strict: true,
      options: { baseline: { type: "string" }, candidate: { type: "string" } },
    })
    const baseline = splitList(values.baseline)
    const candidate = splitList(values.candidate)
    return baseline.length > 0 && candidate.length > 0 ? { baseline, candidate } : "invalid"
  } catch {
    return "invalid"
  }
}

/** pnpm run が渡す先頭の `--` を読み飛ばす。 */
function withoutLeadingSeparator(argv: readonly string[]): string[] {
  return argv[0] === "--" ? argv.slice(1) : [...argv]
}

function splitList(value = ""): readonly string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "")
}
