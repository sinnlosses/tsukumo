// 作業ツリーの git が追う・追える（無視していない未追跡の）ファイルを並べ、`.ts`/`.tsx` の本文から
// `ModuleGraph` を組む。本文は E2E の期待値の持ち主を探すのにも使うので一緒に返す。

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import { importedPaths, type ModuleGraph } from "./module-graph.ts"

export type WorktreeModules = {
  readonly paths: ReadonlySet<string>
  readonly graph: ModuleGraph
  /** `.ts`/`.tsx` のパス → 本文。 */
  readonly sources: ReadonlyMap<string, string>
}

export function readWorktreeModules(root: string): WorktreeModules {
  const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
  const paths = new Set(
    listed
      .split("\n")
      .filter((line) => line !== "")
      .filter((line) => existsSync(path.join(root, line))),
  )
  const sources = new Map(
    [...paths]
      .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
      .map((file) => [file, readFileSync(path.join(root, file), "utf8")] as const),
  )
  const graph = new Map(
    [...sources].map(([file, source]) => [file, importedPaths(file, source, paths)] as const),
  )
  return { paths, graph, sources }
}
