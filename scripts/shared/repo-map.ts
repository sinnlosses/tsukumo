// ファイルごとの export の名前と、鏡になる単体テストのパスを並べた Markdown の地図を組む。

import { parseProgram } from "./ast-node.ts"
import { exportedSymbols } from "./export-symbol.ts"
import { mirrorTestPath } from "./test-mirror.ts"

const HEADER = [
  "# リポジトリの記号の地図",
  "",
  "ファイルごとの export の名前と、鏡になる単体テストのパス。探す前にここを引く。",
  "",
]

/**
 * `sources` はリポジトリ相対のパス（`src/…`）から本文への対応、`testPaths` は実在する単体テストのリポジトリ相対パス。
 * 入力の並びに依らず、ディレクトリ順・ファイル名順の同じ本文を返す。
 */
export function buildRepoMap(
  sources: ReadonlyMap<string, string>,
  testPaths: ReadonlySet<string>,
): string {
  const byDirectory = Map.groupBy([...sources.keys()], directoryOf)
  const sections = [...byDirectory.keys()]
    .toSorted(compareText)
    .flatMap((directory) => [
      `### ${directory}`,
      "",
      ...(byDirectory.get(directory) ?? [])
        .toSorted(compareText)
        .map((path) => describeFile(path, sources.get(path) ?? "", testPaths)),
      "",
    ])
  return [...HEADER, ...sections].join("\n")
}

function describeFile(path: string, source: string, testPaths: ReadonlySet<string>): string {
  const program = parseProgram(path, source)
  const names =
    program === undefined
      ? "読めない"
      : exportedSymbols(program)
          .map(({ name }) => name)
          .join(", ") || "export なし"
  const mirror = mirrorTestPath(path)
  return `- ${path.slice(path.lastIndexOf("/") + 1)} — ${names} — ${testPaths.has(mirror) ? mirror : "テスト無し"}`
}

function directoryOf(path: string): string {
  return path.slice(0, path.lastIndexOf("/"))
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
