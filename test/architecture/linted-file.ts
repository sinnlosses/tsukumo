import { REPOSITORY_ROOT } from "../../scripts/shared/repository-root.ts"
import { listSourceFiles, readFileIfPresent, readSourceFile } from "./source-file.ts"

// `oxlint` と同じ `src` `test` `scripts`（`package.json` の `lint`）。`docs/` `.tw/` は対象外。
const LINTED_DIRS: readonly string[] = ["src", "test", "scripts"]

export function lintedFiles(
  extensions: readonly string[],
): readonly { readonly path: string; readonly lines: readonly string[] }[] {
  return LINTED_DIRS.flatMap((dirName) => {
    const root = `${REPOSITORY_ROOT}/${dirName}`
    return listSourceFiles(root, root, extensions).flatMap((relPath) => {
      const content =
        dirName === "src" ? readSourceFile(relPath) : readFileIfPresent(`${root}/${relPath}`)
      return content === undefined
        ? []
        : [{ path: `${dirName}/${relPath}`, lines: content.split("\n") }]
    })
  })
}
