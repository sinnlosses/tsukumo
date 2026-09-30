// `pnpm run check` の入口。`docs/`・`develop/` の Markdown しか変えていないときは、build を含む
// `test:e2e` と `typecheck`・`lint` を省いて待ち時間を減らす。`format:check` と単体テスト
// （タスク番号や節の参照の検査が文書を見ている）は省かない。
// 重い段（`test`・`test:e2e`）は作業ツリーをまたぐ錠を取って、単体と E2E を並べて走らせる。
// 並べた2段の出力は段ごとに溜め、両方が終わってから段の順に出し、落ちた段は最後の行で名指しする。
//
// 使い方:
//   node scripts/check.ts         # 変えたファイルを見て、文書だけなら重い段を省く
//   node scripts/check.ts --full  # 変えたファイルに関わらず5段すべて走らせる

import { spawn, spawnSync } from "node:child_process"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { collectChangedPaths, resolvePrimaryBranch } from "./lib/changed-path-repository.ts"
import { describeFailedStages, type StageOutcome } from "./lib/check-failure.ts"
import { acquireCheckLock, withCheckLockOwner } from "./lib/check-lock-repository.ts"
import { isDocumentOnlyChange } from "./lib/document-change.ts"

type Stage = {
  readonly name: string
  /** 文書だけの変更のとき省いてよいか。 */
  readonly skippable: boolean
  /** 錠の中で並べて走らせる重い段か。 */
  readonly heavy: boolean
}

const STAGES = [
  { name: "typecheck", skippable: true, heavy: false },
  { name: "lint", skippable: true, heavy: false },
  { name: "format:check", skippable: false, heavy: false },
  { name: "test", skippable: false, heavy: true },
  { name: "test:e2e", skippable: true, heavy: true },
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

const activeStages = STAGES.filter((stage) => !(skipHeavyStages && stage.skippable))

for (const stage of activeStages.filter((candidate) => !candidate.heavy)) {
  const result = spawnSync("pnpm", ["run", stage.name], { cwd: ROOT, stdio: "inherit" })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const heavyStages = activeStages.filter((stage) => stage.heavy)
if (heavyStages.length > 0) {
  const release = await acquireCheckLock(ROOT)
  const onSignal = (signal: NodeJS.Signals): void => {
    release()
    process.kill(process.pid, signal)
  }
  process.once("SIGINT", onSignal)
  process.once("SIGTERM", onSignal)
  try {
    const results = await Promise.all(heavyStages.map((stage) => runBuffered(stage.name)))
    for (const result of results) {
      process.stdout.write(result.output)
    }
    for (const line of describeFailedStages(results)) {
      process.stdout.write(`${line}\n`)
    }
    const failed = results.find((result) => result.status !== 0)
    if (failed !== undefined) {
      process.exitCode = failed.status
    }
  } finally {
    release()
  }
}

type BufferedResult = StageOutcome & { readonly output: string }

function runBuffered(name: string): Promise<BufferedResult> {
  return new Promise((resolve) => {
    const child = spawn("pnpm", ["run", name], {
      cwd: ROOT,
      env: withCheckLockOwner(process.env),
      stdio: ["ignore", "pipe", "pipe"],
    })
    const chunks: Buffer[] = []
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk))
    child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk))
    child.on("close", (code) => {
      resolve({ name, status: code ?? 1, output: Buffer.concat(chunks).toString("utf8") })
    })
  })
}
