// 集計の台本が受ける唯一の引数 `--days <n>`（直近何日を読むか）。
import { parseArgs } from "node:util"

import { positiveIntegerArgument } from "./positive-integer-argument.ts"

/** コマンドラインから `--days <n>` を読む。無ければ既定の28日、崩れていれば `"invalid"`。 */
export function parseDaysOption(argv: readonly string[]): number | "invalid" {
  try {
    const { values } = parseArgs({
      args: [...argv],
      strict: true,
      options: { days: { type: "string" } },
    })
    const parsed = positiveIntegerArgument.default(28).safeParse(values.days)
    return parsed.success ? parsed.data : "invalid"
  } catch {
    return "invalid"
  }
}
