// AGENTS.md・README.md・`docs/`（`docs/history/` を除く）が書いている `pnpm run <名前>` と
// `node scripts/….ts` のうち、実在しないものを一覧する。読むだけで何も書き換えない。
// 週に1回の掃除や、コマンドを改名・削除したあとに打つ。拾う形は `findCommandReferences` に書いてある。

import { existsSync, globSync, readFileSync } from "node:fs"
import process from "node:process"

import { REPOSITORY_ROOT } from "../shared/repository-root.ts"
import {
  findCommandReferences,
  findMissingCommandReferences,
  formatMissingCommandReference,
} from "./command-reference.ts"

const packageJson: { scripts?: Record<string, string> } = JSON.parse(
  readFileSync(`${REPOSITORY_ROOT}/package.json`, "utf8"),
)
const scriptNames = new Set(Object.keys(packageJson.scripts ?? {}))

const documentPaths = [
  "AGENTS.md",
  "README.md",
  ...globSync("docs/**/*.md", { cwd: REPOSITORY_ROOT }),
]
const references = documentPaths.flatMap((path) =>
  findCommandReferences(path, readFileSync(`${REPOSITORY_ROOT}/${path}`, "utf8")),
)
const missing = findMissingCommandReferences(references, scriptNames, (path) =>
  existsSync(`${REPOSITORY_ROOT}/${path}`),
)

for (const reference of missing) {
  process.stdout.write(`${formatMissingCommandReference(reference)}\n`)
}
process.stdout.write(`実在しないコマンド: ${missing.length}件\n`)
process.exit(missing.length === 0 ? 0 : 1)
