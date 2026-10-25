// 再演の台本が受ける引数 `--tasks <ID,…> --k <n>`。
import { parseArgs } from "node:util"

import { positiveIntegerArgument } from "./positive-integer-argument.ts"

export type ReplayOptions = {
  readonly tasks: readonly string[]
  readonly k: number
}

/** コマンドラインから `--tasks` と `--k` を読む。`--tasks` は必須、`--k` の既定は2。崩れていれば `"invalid"`。 */
export function parseReplayOptions(argv: readonly string[]): ReplayOptions | "invalid" {
  try {
    const { values } = parseArgs({
      args: argv[0] === "--" ? argv.slice(1) : [...argv],
      strict: true,
      options: { tasks: { type: "string" }, k: { type: "string" } },
    })
    const tasks = (values.tasks ?? "")
      .split(",")
      .map((task) => task.trim())
      .filter((task) => task !== "")
    const k = positiveIntegerArgument.default(2).safeParse(values.k)
    return tasks.length > 0 && k.success ? { tasks, k: k.data } : "invalid"
  } catch {
    return "invalid"
  }
}
