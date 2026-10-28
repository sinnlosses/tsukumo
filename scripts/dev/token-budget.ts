// 渡したパスごとに、トークン上限までの残りを `パス<TAB>残り<TAB>上限` の 1 行で出す。
// 使い方: node scripts/dev/token-budget.ts <パス…>
// 検査から外れるパスと実在しないパスは出さない。終了コードは常に 0。パスは作業ツリーの根からの相対。

import { statSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

import { REPOSITORY_ROOT } from "../shared/repository-root.ts"
import { countTokens } from "../shared/token-limit.ts"

for (const path of process.argv.slice(2)) {
  const bytes = fileBytesOf(path)
  if (bytes === undefined) continue
  const { tokens, limit, status } = countTokens(path, bytes)
  if (status === "exempt") continue
  process.stdout.write(`${path}\t${limit - tokens}\t${limit}\n`)
}

function fileBytesOf(path: string): number | undefined {
  try {
    const stat = statSync(join(REPOSITORY_ROOT, path))
    return stat.isFile() ? stat.size : undefined
  } catch {
    return undefined
  }
}
