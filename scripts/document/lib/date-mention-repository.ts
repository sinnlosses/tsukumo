// `docs/`（`docs/architecture/adr/`・`docs/history/`・`docs/research/` を除く）の Markdown を読み、
// `findDateMentions` に渡して日付を含む行を集める、という概念1つを持つ。

import { globSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { type DateMention, findDateMentions } from "../date-mention.ts"

const EXCLUDED_PREFIXES = ["docs/architecture/adr/", "docs/history/", "docs/research/"] as const

/** `root` 以下の `docs/` を読み、日付を含む行をすべて返す。 */
export function collectDateMentions(root: string): DateMention[] {
  return globSync("docs/**/*.md", { cwd: root })
    .filter((path) => !EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix)))
    .toSorted()
    .flatMap((path) => findDateMentions(path, readFileSync(join(root, path), "utf8")))
}
