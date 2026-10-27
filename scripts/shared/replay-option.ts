// タスクの再試の台本が受ける引数 `--tasks <ID,…> --k <n>`。
import { parseArgs } from "node:util"

import { positiveIntegerArgument } from "./positive-integer-argument.ts"

export type ReplayOptions = {
  readonly tasks: readonly string[]
  readonly k: number
  readonly brief: string | undefined
}

/** コマンドラインから `--tasks`・`--k`・`--brief` を読む。`--tasks` は必須、`--k` の既定は2、`--brief` は省ける。崩れていれば `"invalid"`。 */
export function parseReplayOptions(argv: readonly string[]): ReplayOptions | "invalid" {
  try {
    const { values } = parseArgs({
      args: argv[0] === "--" ? argv.slice(1) : [...argv],
      strict: true,
      options: { tasks: { type: "string" }, k: { type: "string" }, brief: { type: "string" } },
    })
    const tasks = (values.tasks ?? "")
      .split(",")
      .map((task) => task.trim())
      .filter((task) => task !== "")
    const k = positiveIntegerArgument.default(2).safeParse(values.k)
    const briefValid = values.brief !== ""
    return tasks.length > 0 && k.success && briefValid
      ? { tasks, k: k.data, brief: values.brief }
      : "invalid"
  } catch {
    return "invalid"
  }
}
