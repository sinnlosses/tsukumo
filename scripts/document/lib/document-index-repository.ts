// ADR・設計判断の表・用語集の索引のファイルを読み書きし、`document-index` の関数に渡す。

import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import {
  DECISION_TABLE_HEADING,
  decisionRows,
  GLOSSARY_FILE_INDEX_HEADING,
  GLOSSARY_INDEX_HEADING,
  glossaryFileRows,
  glossaryIndexRows,
  readTableRows,
  replaceTableRows,
  type TableRow,
  type TitledFile,
} from "../document-index.ts"

const ADR_DIRECTORY = "docs/architecture/adr"
const ARCHITECTURE_PATH = "docs/architecture.md"
const GLOSSARY_PATH = "docs/glossary.md"
const GLOSSARY_DIRECTORY = "docs/glossary"

/** 表のあるべき行（題と見出しから組み立てたもの）と、いま書かれている行。 */
export type IndexState = {
  readonly name: string
  readonly expected: TableRow[]
  readonly actual: TableRow[]
}

/** `root` 以下の表（設計判断・用語集とその子のファイルの索引）について、あるべき行といま書かれている行を返す。 */
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
      expected: glossaryFileRows(readGlossaryFiles(root)),
      actual: readTableRows(glossary, GLOSSARY_INDEX_HEADING),
    },
    ...listGlossaryFiles(root).map((fileName) => {
      const text = readFileSync(join(root, GLOSSARY_DIRECTORY, fileName), "utf8")
      return {
        name: `${GLOSSARY_DIRECTORY}/${fileName} ${GLOSSARY_FILE_INDEX_HEADING}`,
        expected: glossaryIndexRows(text),
        actual: readTableRows(text, GLOSSARY_FILE_INDEX_HEADING),
      }
    }),
  ]
}

/** `root` 以下の表を、題と見出しから組み立てた行に書き直す。 */
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
    replaceTableRows(glossary, GLOSSARY_INDEX_HEADING, glossaryFileRows(readGlossaryFiles(root))),
  )
  for (const fileName of listGlossaryFiles(root)) {
    const path = join(root, GLOSSARY_DIRECTORY, fileName)
    const text = readFileSync(path, "utf8")
    writeFileSync(
      path,
      replaceTableRows(text, GLOSSARY_FILE_INDEX_HEADING, glossaryIndexRows(text)),
    )
  }
}

/** 用語集の子のファイルの名前（昇順）。 */
function listGlossaryFiles(root: string): string[] {
  return readdirSync(join(root, GLOSSARY_DIRECTORY))
    .filter((fileName) => fileName.endsWith(".md"))
    .toSorted()
}

function readAdrs(root: string): TitledFile[] {
  return readTitledFiles(
    root,
    ADR_DIRECTORY,
    readdirSync(join(root, ADR_DIRECTORY)).filter((fileName) => /^\d{4}-.*\.md$/.test(fileName)),
  )
}

function readGlossaryFiles(root: string): TitledFile[] {
  return readTitledFiles(root, GLOSSARY_DIRECTORY, listGlossaryFiles(root))
}

function readTitledFiles(
  root: string,
  directory: string,
  fileNames: readonly string[],
): TitledFile[] {
  return fileNames.map((fileName) => ({
    fileName,
    title: (readFileSync(join(root, directory, fileName), "utf8").split("\n")[0] ?? "")
      .replace(/^# /, "")
      .trim(),
  }))
}
