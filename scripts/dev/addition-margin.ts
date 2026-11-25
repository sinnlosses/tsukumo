// 部品や文を足す前に、字数とトークン数の上限の余白を出す。
// 使い方: node scripts/dev/addition-margin.ts
// 出力: <名前>\t<いま>\t<上限>\t<残り> を 1 行ずつ。残りは超えると負。終了コードは常に 0。

import process from "node:process"

import { REPOSITORY_ROOT } from "../shared/repository-root.ts"
import { measureBudgets } from "./lib/budget-measure.ts"

const measurements = await measureBudgets(REPOSITORY_ROOT)
process.stdout.write(
  measurements
    .map(
      ({ name, unit, current, limit }) =>
        `${name}（${unit}）\t${current}\t${limit}\t${limit - current}\n`,
    )
    .join(""),
)
