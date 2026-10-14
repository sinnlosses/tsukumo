// ADR の一覧表と用語集の索引を、元の見出しから組み立てる純粋関数。
// 表の範囲は、指定した見出しより後で最初に現れる `|` で始まる連続した行。

/** ADR 1件（ファイル名と、1行目の `# ` の題）。 */
export type AdrEntry = {
  readonly fileName: string
  readonly title: string
}

export type TableRow = readonly [string, string]

export const DECISION_TABLE_HEADING = "## 設計判断（なぜ今の形なのか）"
export const GLOSSARY_INDEX_HEADING = "### 用語の索引"

const GLOSSARY_SKIPPED_SECTION = "## このファイルの読み方"

/** 設計判断の表の行（ファイル名の昇順）。 */
export function decisionRows(adrs: readonly AdrEntry[]): TableRow[] {
  return adrs
    .toSorted((a, b) => (a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0))
    .map(({ fileName, title }) => [`\`docs/architecture/adr/${fileName}\``, title])
}

/** 用語集の索引の行（`## ` 節ごとの `### ` 見出し）。 */
export function glossaryIndexRows(glossary: string): TableRow[] {
  const sections: { heading: string; terms: string[] }[] = []
  let inFence = false
  for (const line of glossary.split("\n")) {
    if (line.startsWith("```")) {
      inFence = !inFence
    } else if (!inFence && line.startsWith("## ")) {
      sections.push({ heading: line.trim(), terms: [] })
    } else if (!inFence && line.startsWith("### ")) {
      sections.at(-1)?.terms.push(line.slice(4).trim())
    }
  }
  return sections
    .filter(({ heading, terms }) => heading !== GLOSSARY_SKIPPED_SECTION && terms.length > 0)
    .map(({ heading, terms }) => [heading, terms.join(" / ")])
}

/** `heading` の後の表の、見出し行と区切り行を除いたセルの中身（前後の空白なし）。 */
export function readTableRows(text: string, heading: string): TableRow[] {
  const range = findTableRange(text.split("\n"), heading)
  if (range === undefined) {
    return []
  }
  return range.lines.slice(2).map(parseRow)
}

/** `heading` の後の表の行を `rows` に差し替える。見出し行と区切り行は残す。 */
export function replaceTableRows(text: string, heading: string, rows: readonly TableRow[]): string {
  const lines = text.split("\n")
  const range = findTableRange(lines, heading)
  if (range === undefined) {
    return text
  }
  const rendered = [...range.lines.slice(0, 2), ...rows.map(([a, b]) => `| ${a} | ${b} |`)]
  return [...lines.slice(0, range.start), ...rendered, ...lines.slice(range.end)].join("\n")
}

function findTableRange(
  lines: readonly string[],
  heading: string,
): { start: number; end: number; lines: string[] } | undefined {
  const headingIndex = lines.indexOf(heading)
  if (headingIndex < 0) {
    return undefined
  }
  const start = lines.findIndex((line, i) => i > headingIndex && line.startsWith("|"))
  if (start < 0) {
    return undefined
  }
  const length = lines.slice(start).findIndex((line) => !line.startsWith("|"))
  const end = length < 0 ? lines.length : start + length
  return { start, end, lines: lines.slice(start, end) }
}

function parseRow(line: string): TableRow {
  const [first = "", second = ""] = line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim())
  return [first, second]
}
