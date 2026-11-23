// 地図の定義（`docs/architecture/architecture-map.toml`）と実際の依存のずれを検査し、根の `.architecture-map.json` を書き直す入口。
// 作り手は tsukumo-plugins の `architecture_map.py`。ずれ（error）があれば作り手の終了コード 1 をそのまま返す。
//
// 使い方:
//   pnpm run architecture-map

import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import process from "node:process"

import { REPOSITORY_ROOT as ROOT } from "../shared/repository-root.ts"
import { worktreeTree } from "./lib/check-record-repository.ts"

const DEFINITION = "docs/architecture/architecture-map.toml"
const MAP_FILE = ".architecture-map.json"
const MAKER =
  "vendor/tsukumo-plugins/plugins/tsukumo-architecture-map/skills/architecture-map/scripts/architecture_map.py"
/** dependency-cruiser の JSON が入るバッファ。 */
const CRUISE_BUFFER_BYTES = 256 * 1024 * 1024

type CruiseDependency = { readonly resolved?: string; readonly couldNotResolve?: boolean }
type CruiseModule = {
  readonly source: string
  readonly couldNotResolve?: boolean
  readonly dependencies: readonly CruiseDependency[]
}
type CruiseOutput = { readonly modules: readonly CruiseModule[] }

const cruise = spawnSync(
  "pnpm",
  ["exec", "depcruise", "src", "--config", ".dependency-cruiser.cjs", "--output-type", "json"],
  { cwd: ROOT, encoding: "utf8", maxBuffer: CRUISE_BUFFER_BYTES },
)
if (cruise.status !== 0) {
  process.stderr.write(`${cruise.stderr}\ndepcruise が失敗した\n`)
  process.exit(cruise.status ?? 1)
}

const scratch = mkdtempSync(join(tmpdir(), "tsukumo-architecture-map-"))
try {
  const dependenciesPath = join(scratch, "dependencies.json")
  writeFileSync(dependenciesPath, JSON.stringify(withoutUnresolved(JSON.parse(cruise.stdout))))
  const tree = worktreeTree(ROOT)
  const maker = spawnSync(
    "python3",
    [
      MAKER,
      "--definition",
      DEFINITION,
      "--dependencies",
      dependenciesPath,
      "--output",
      MAP_FILE,
      ...(tree === "" ? [] : ["--tree", tree]),
    ],
    { cwd: ROOT, encoding: "utf8" },
  )
  process.stdout.write(maker.stdout)
  process.stderr.write(maker.stderr)
  process.exitCode = maker.status ?? 1
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

/** npm の指定子など、解決できなかった先は箱に属さないので、地図の入力から外す。 */
function withoutUnresolved(output: CruiseOutput): CruiseOutput {
  const unresolved = new Set(
    output.modules
      .filter((module) => module.couldNotResolve === true)
      .map((module) => module.source),
  )
  return {
    ...output,
    modules: output.modules
      .filter((module) => !unresolved.has(module.source))
      .map((module) => ({
        ...module,
        dependencies: module.dependencies.filter(
          (dependency) =>
            dependency.couldNotResolve !== true &&
            !(dependency.resolved !== undefined && unresolved.has(dependency.resolved)),
        ),
      })),
  }
}
