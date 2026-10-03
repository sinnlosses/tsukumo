// 作業ツリーの import のつながりと見張りの表を集めて、変えたファイルから流す E2E を選ぶ。

import { type E2eSelection, selectE2eFiles } from "./e2e-selection.ts"
import { E2E_REGION_ROOTS, E2E_WATCHED_REGIONS } from "./e2e-watch.ts"
import { readWorktreeModules } from "./module-graph-repository.ts"

export type WorktreeE2eSelection = {
  readonly selection: E2eSelection
  /** `test/e2e/*.test.ts` の数。 */
  readonly total: number
}

export function readE2eSelection(
  root: string,
  changedPaths: readonly string[],
): WorktreeE2eSelection {
  const modules = readWorktreeModules(root)
  const e2eFiles = [...modules.paths].filter((file) => /^test\/e2e\/[^/]+\.test\.ts$/.test(file))
  const selection = selectE2eFiles(changedPaths, {
    graph: modules.graph,
    sources: modules.sources,
    e2eFiles: e2eFiles.toSorted(),
    regionRoots: E2E_REGION_ROOTS,
    watchedRegions: E2E_WATCHED_REGIONS,
  })
  return { selection, total: e2eFiles.length }
}
