// ADR・親の文書・子の文書の節の索引を読み書きし、`document-index` の関数に渡す。

import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import {
  CHILD_LIST_COLUMNS,
  childListRows,
  type ChildFile,
  DECISION_TABLE_COLUMNS,
  DECISION_TABLE_HEADING,
  decisionRows,
  readAdrStatus,
  readChildIndex,
  readTableRows,
  replaceTable,
  rewriteChildIndex,
  SECTION_INDEX_HEADING,
  type TableRow,
  type TitledFile,
} from "../document-index.ts"

const ADR_DIRECTORY = "docs/architecture/adr"
const ARCHITECTURE_PATH = "docs/architecture.md"
const DOCUMENT_DIRECTORY = "docs"

// 節の索引を照らさない文書（据え置きの記録と、索引を作らない調査の記録）。
const UNINDEXED_PREFIXES = ["docs/history/", "docs/research/"] as const satisfies readonly string[]

// 子のディレクトリ（`.md` を除いた同じ名前）の直下のファイルを、節の索引に一覧する親。
const PARENT_PATHS = [
  "docs/architecture.md",
  "docs/architecture/browser.md",
  "docs/architecture/build.md",
  "docs/architecture/chat-mode.md",
  "docs/architecture/screen-design.md",
  "docs/architecture/testing.md",
  "docs/architecture/workflow-contract.md",
  "docs/coding-standards.md",
  "docs/glossary.md",
  "docs/requirements.md",
  "docs/workflow.md",
] as const satisfies readonly string[]

/** 表のあるべき行（題と見出しから組み立てたもの）と、いま書かれている行。 */
export type IndexState = {
  readonly kind: "decision" | "child-list" | "section-index"
  readonly name: string
  readonly expected: TableRow[]
  readonly actual: TableRow[]
}

/** `root` 以下の表（設計判断・親の子の一覧・子の文書の節の索引）について、あるべき行といま書かれている行を返す。 */
export function readIndexStates(root: string): IndexState[] {
  const architecture = readFileSync(join(root, ARCHITECTURE_PATH), "utf8")
  return [
    {
      kind: "decision",
      name: `${ARCHITECTURE_PATH} ${DECISION_TABLE_HEADING}`,
      expected: decisionRows(readAdrs(root)),
      actual: readTableRows(architecture, DECISION_TABLE_HEADING),
    },
    ...PARENT_PATHS.map((parentPath) => ({
      kind: "child-list" as const,
      name: `${parentPath} ${SECTION_INDEX_HEADING}`,
      expected: childListRows(childDirectoryOf(parentPath), readChildFiles(root, parentPath)),
      actual: readTableRows(readFileSync(join(root, parentPath), "utf8"), SECTION_INDEX_HEADING),
    })),
    ...listChildDocuments(root).flatMap((path) => {
      const index = readChildIndex(readFileSync(join(root, path), "utf8"))
      return index === undefined
        ? []
        : [{ kind: "section-index" as const, name: `${path} 節の索引`, ...index }]
    }),
  ]
}

/** `root` 以下の表を、題と見出しから組み立てた行に書き直す。 */
export function writeIndexes(root: string): void {
  const architecturePath = join(root, ARCHITECTURE_PATH)
  writeFileSync(
    architecturePath,
    replaceTable(
      readFileSync(architecturePath, "utf8"),
      DECISION_TABLE_HEADING,
      DECISION_TABLE_COLUMNS,
      decisionRows(readAdrs(root)),
    ),
  )
  for (const parentPath of PARENT_PATHS) {
    const path = join(root, parentPath)
    writeFileSync(
      path,
      replaceTable(
        readFileSync(path, "utf8"),
        SECTION_INDEX_HEADING,
        CHILD_LIST_COLUMNS,
        childListRows(childDirectoryOf(parentPath), readChildFiles(root, parentPath)),
      ),
    )
  }
  for (const childPath of listChildDocuments(root)) {
    const path = join(root, childPath)
    const text = readFileSync(path, "utf8")
    const rewritten = rewriteChildIndex(text)
    if (rewritten !== text) {
      writeFileSync(path, rewritten)
    }
  }
}

/** 節の索引を照らす子の文書（`docs/` 以下の `.md` から、親・記録・調査の記録を除いたもの。昇順）。 */
function listChildDocuments(root: string): string[] {
  const parents = new Set<string>(PARENT_PATHS)
  return readdirSync(join(root, DOCUMENT_DIRECTORY), { recursive: true, encoding: "utf8" })
    .map((relativePath) => `${DOCUMENT_DIRECTORY}/${relativePath}`)
    .filter(
      (path) =>
        path.endsWith(".md") &&
        !parents.has(path) &&
        !UNINDEXED_PREFIXES.some((prefix) => path.startsWith(prefix)),
    )
    .toSorted()
}

function childDirectoryOf(parentPath: string): string {
  return parentPath.slice(0, -".md".length)
}

function readChildFiles(root: string, parentPath: string): ChildFile[] {
  const directory = childDirectoryOf(parentPath)
  return listMarkdownFiles(root, directory).map((fileName) => ({
    fileName,
    text: readFileSync(join(root, directory, fileName), "utf8"),
  }))
}

/** `directory` の直下の `.md` の名前（昇順）。 */
function listMarkdownFiles(root: string, directory: string): string[] {
  return readdirSync(join(root, directory))
    .filter((fileName) => fileName.endsWith(".md"))
    .toSorted()
}

function readAdrs(root: string): TitledFile[] {
  return readdirSync(join(root, ADR_DIRECTORY))
    .filter((fileName) => /^\d{4}-.*\.md$/.test(fileName))
    .map((fileName) => {
      const text = readFileSync(join(root, ADR_DIRECTORY, fileName), "utf8")
      return {
        fileName,
        title: (text.split("\n")[0] ?? "").replace(/^# /, "").trim(),
        status: readAdrStatus(text) ?? "",
      }
    })
}
