import { readFileSync } from "node:fs"

import { REPOSITORY_ROOT } from "../../scripts/shared/repository-root.ts"
import { listSourceFiles } from "./source-file.ts"

// `oxlint` と同じ `src` `test` `scripts`（`package.json` の `lint`）。`docs/` `.tw/` は対象外。
const LINTED_DIRS: readonly string[] = ["src", "test", "scripts"]

export function lintedFiles(
  extensions: readonly string[],
): readonly { readonly path: string; readonly lines: readonly string[] }[] {
  return LINTED_DIRS.flatMap((dirName) => {
    const root = `${REPOSITORY_ROOT}/${dirName}`
    return listSourceFiles(root, root, extensions).map((relPath) => ({
      path: `${dirName}/${relPath}`,
      lines: readFileSync(`${root}/${relPath}`, "utf8").split("\n"),
    }))
  })
}
