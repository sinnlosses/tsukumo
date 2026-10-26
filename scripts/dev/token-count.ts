// 渡したパスのトークン数を、上限と状態（over・near・ok・exempt）つきで 1 パス 1 行に出す。
// 使い方: node scripts/dev/token-count.ts <パス…>
// 出力: <パス>\t<トークン数>\t<上限>\t<status>。パスは作業ツリーの根からの相対。

import { statSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

import { REPOSITORY_ROOT } from "../shared/repository-root.ts"
import { countTokens } from "../shared/token-limit.ts"

const paths = process.argv.slice(2)
if (paths.length === 0) {
  process.stderr.write("使い方: node scripts/dev/token-count.ts <パス…>\n")
  process.exit(1)
}

for (const path of paths) {
  const { tokens, limit, status } = countTokens(path, statSync(join(REPOSITORY_ROOT, path)).size)
  process.stdout.write(`${path}\t${tokens}\t${limit}\t${status}\n`)
}
