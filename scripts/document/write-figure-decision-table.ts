// 塊の基準の「図の決定表」の表を、決定表の行と規則から書き直す（`pnpm run format` が打つ）。

import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { REPOSITORY_ROOT } from "../shared/repository-root.ts"
import { rewriteFigureDecisionTables } from "./figure-decision-table.ts"

const CRITERIA_PATH = join(REPOSITORY_ROOT, "docs/architecture/display/block-criteria.md")

const text = readFileSync(CRITERIA_PATH, "utf8")
const rewritten = rewriteFigureDecisionTables(text)
if (rewritten !== text) {
  writeFileSync(CRITERIA_PATH, rewritten)
}
