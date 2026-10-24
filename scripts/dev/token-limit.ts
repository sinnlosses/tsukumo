// ファイルが大きくなりすぎていないかを、HEAD と比べて検査する。
// 使い方: node scripts/dev/token-limit.ts [--staged]
// 既定は作業ツリー（未追跡を含む）、`--staged` はコミットにステージしたファイル（git の pre-commit が呼ぶ）。
//
// 拒否するときは stderr に理由を出して終了コード 1 で止める。
// git が失敗して判定できないファイルは通す。

import process from "node:process"
import { parseArgs } from "node:util"

import { REPOSITORY_ROOT } from "../shared/repository-root.ts"
import { readStagedChanges, readWorktreeChanges } from "../shared/token-limit-change.ts"
import { findOversizedFiles, formatTokenLimitRefusal } from "../shared/token-limit.ts"

const { values } = parseArgs({
  args: process.argv.slice(2),
  strict: true,
  options: { staged: { type: "boolean", default: false } },
})

const changes = values.staged
  ? readStagedChanges(process.cwd())
  : readWorktreeChanges(REPOSITORY_ROOT)
const oversized = findOversizedFiles(changes)
if (oversized.length > 0) {
  process.stderr.write(`${formatTokenLimitRefusal(oversized)}\n`)
  process.exit(1)
}
