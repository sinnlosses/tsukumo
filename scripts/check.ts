// `pnpm run check` の入口。`docs/`・`develop/` の Markdown しか変えていないときは、build を含む
// `test:e2e` と `typecheck`・`lint` を省いて待ち時間を減らす。`format:check` と単体テスト
// （タスク番号や節の参照の検査が文書を見ている）は省かない。
//
// 使い方:
//   node scripts/check.ts         # 変えたファイルを見て、文書だけなら重い段を省く
//   node scripts/check.ts --full  # 変えたファイルに関わらず5段すべて走らせる

import { spawnSync } from "node:child_process"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { collectChangedPaths, resolvePrimaryBranch } from "./lib/changed-path-repository.ts"
import { isDocumentOnlyChange } from "./lib/document-change.ts"

type Stage = {
  readonly name: string
  /** 文書だけの変更のとき省いてよいか。 */
  readonly skippable: boolean
}

const STAGES = [
  { name: "typecheck", skippable: true },
  { name: "lint", skippable: true },
  { name: "format:check", skippable: false },
  { name: "test", skippable: false },
  { name: "test:e2e", skippable: true },
] as const satisfies readonly Stage[]

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const forceFull = process.argv.includes("--full")

const skipHeavyStages =
  !forceFull && isDocumentOnlyChange(collectChangedPaths(ROOT, resolvePrimaryBranch(ROOT)))
if (skipHeavyStages) {
  const skipped = STAGES.filter((stage) => stage.skippable)
    .map((stage) => stage.name)
    .join("・")
  process.stdout.write(`文書だけの変更のため ${skipped} を省く\n`)
}

for (const stage of STAGES) {
  if (skipHeavyStages && stage.skippable) {
    continue
  }
  const result = spawnSync("pnpm", ["run", stage.name], { cwd: ROOT, stdio: "inherit" })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
