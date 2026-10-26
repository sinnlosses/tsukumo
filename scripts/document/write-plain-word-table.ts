// 用語集の「わかりにくい語」の表を、`PLAIN_WORDS` から書き直す（`pnpm run format` が打つ）。

import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { PLAIN_WORDS } from "../../src/shared/report/plain-word.ts"
import { REPOSITORY_ROOT } from "../shared/repository-root.ts"
import { rewritePlainWordTable } from "./plain-word-table.ts"

const GLOSSARY_PATH = join(REPOSITORY_ROOT, "docs/glossary/plain-word.md")

const text = readFileSync(GLOSSARY_PATH, "utf8")
const rewritten = rewritePlainWordTable(text, PLAIN_WORDS)
if (rewritten !== text) {
  writeFileSync(GLOSSARY_PATH, rewritten)
}
