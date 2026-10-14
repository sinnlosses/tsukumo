// 作業ツリーの import のつながりと見張りの表を集めて、変えたファイルから流す E2E を選ぶ。

import { describeE2eSelection, type E2eSelection, selectE2eFiles } from "./e2e-selection.ts"
import { E2E_REGION_ROOTS, E2E_WATCHED_REGIONS } from "./e2e-watch.ts"
import { readWorktreeModules } from "./module-graph-repository.ts"

export type WorktreeE2eSelection = {
  readonly selection: E2eSelection
  /** `test/e2e/*.test.ts` の数。 */
  readonly total: number
}

export type E2eRunPlan =
  | { readonly kind: "none"; readonly line: string }
  | { readonly kind: "run"; readonly args: readonly string[]; readonly line: string }

/** `--full` か、変えたファイルから選んだ結果で、`test:e2e` の段を流すか・何を渡すか・出す1行。 */
export function planE2eRun(
  root: string,
  changedPaths: readonly string[],
  forceFull: boolean,
): E2eRunPlan {
  if (forceFull) {
    return { kind: "run", args: [], line: "E2E: --full なので全件を流す" }
  }
  const { selection, total } = readE2eSelection(root, changedPaths)
  const line = describeE2eSelection(selection, total)
  if (selection.kind === "all") {
    return { kind: "run", args: [], line }
  }
  return selection.files.length === 0
    ? { kind: "none", line }
    : { kind: "run", args: selection.files, line }
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
