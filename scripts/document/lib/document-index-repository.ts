// ADR・設計判断の表・用語集の索引のファイルを読み書きし、`document-index` の関数に渡す。

import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import {
  type AdrEntry,
  DECISION_TABLE_HEADING,
  decisionRows,
  GLOSSARY_INDEX_HEADING,
  glossaryIndexRows,
  readTableRows,
  replaceTableRows,
  type TableRow,
} from "../document-index.ts"

const ADR_DIRECTORY = "docs/architecture/adr"
const ARCHITECTURE_PATH = "docs/architecture.md"
const GLOSSARY_PATH = "docs/glossary.md"

/** 表のあるべき行（見出しから組み立てたもの）と、いま書かれている行。 */
export type IndexState = {
  readonly name: string
  readonly expected: TableRow[]
  readonly actual: TableRow[]
}

/** `root` 以下の2つの表について、あるべき行といま書かれている行を返す。 */
export function readIndexStates(root: string): IndexState[] {
  const architecture = readFileSync(join(root, ARCHITECTURE_PATH), "utf8")
  const glossary = readFileSync(join(root, GLOSSARY_PATH), "utf8")
  return [
    {
      name: `${ARCHITECTURE_PATH} ${DECISION_TABLE_HEADING}`,
      expected: decisionRows(readAdrs(root)),
      actual: readTableRows(architecture, DECISION_TABLE_HEADING),
    },
    {
      name: `${GLOSSARY_PATH} ${GLOSSARY_INDEX_HEADING}`,
      expected: glossaryIndexRows(glossary),
      actual: readTableRows(glossary, GLOSSARY_INDEX_HEADING),
    },
  ]
}

/** `root` 以下の2つの表を、見出しから組み立てた行に書き直す。 */
export function writeIndexes(root: string): void {
  const architecturePath = join(root, ARCHITECTURE_PATH)
  const glossaryPath = join(root, GLOSSARY_PATH)
  const glossary = readFileSync(glossaryPath, "utf8")
  writeFileSync(
    architecturePath,
    replaceTableRows(
      readFileSync(architecturePath, "utf8"),
      DECISION_TABLE_HEADING,
      decisionRows(readAdrs(root)),
    ),
  )
  writeFileSync(
    glossaryPath,
    replaceTableRows(glossary, GLOSSARY_INDEX_HEADING, glossaryIndexRows(glossary)),
  )
}

function readAdrs(root: string): AdrEntry[] {
  return readdirSync(join(root, ADR_DIRECTORY))
    .filter((fileName) => /^\d{4}-.*\.md$/.test(fileName))
    .map((fileName) => ({
      fileName,
      title: (readFileSync(join(root, ADR_DIRECTORY, fileName), "utf8").split("\n")[0] ?? "")
        .replace(/^# /, "")
        .trim(),
    }))
}
