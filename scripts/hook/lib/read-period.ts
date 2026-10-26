// 記録を読む台本の `--days N` を読む。正の整数でなければ stderr に出して終了コード 1 で止める。

import process from "node:process"
import { parseArgs } from "node:util"

import { positiveIntegerArgument } from "../../shared/positive-integer-argument.ts"

export function readDays(args: readonly string[], defaultDays: number): number {
  try {
    const { values } = parseArgs({
      args: [...args],
      strict: true,
      options: { days: { type: "string" } },
    })
    return positiveIntegerArgument.default(defaultDays).parse(values.days)
  } catch {
    process.stderr.write("--days には正の整数を渡す\n")
    return process.exit(1)
  }
}
