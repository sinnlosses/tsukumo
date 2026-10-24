// ADR の一覧表・親の文書の子の一覧・子の文書の節の索引を、元の題と見出しから組み立てる純粋関数。
// 表の範囲は、指定した見出しより後で最初に現れる `|` で始まる連続した行。
// 見出しはコードブロックの外の行だけを数える。

/** 一覧に載せる文書1件（ADR。ファイル名と、1行目の `# ` の題）。 */
export type TitledFile = {
  readonly fileName: string
  readonly title: string
}

/** 親の一覧に載せる子のファイル1件（ファイル名と本文）。 */
export type ChildFile = {
  readonly fileName: string
  readonly text: string
}

export type TableRow = readonly string[]

export const DECISION_TABLE_HEADING = "## 設計判断（なぜ今の形なのか）"
export const SECTION_INDEX_HEADING = "## 節の索引"
export const CHILD_LIST_COLUMNS = ["ファイル", "題", "節"] as const satisfies TableRow

const SECTION_INDEX_COLUMNS = ["節", "小節"] as const satisfies TableRow

// 本文の `##` の節がこの数以下の文書は、節の索引を置かない。
const MAX_SECTIONS_WITHOUT_INDEX = 2

const SECTION_INDEX_TITLE = "節の索引"

// 文書の読み方の案内の見出し。親の一覧の「節」の列には載せない。
const READING_GUIDE_TITLES = new Set([
  "このファイルの読み方",
  "このドキュメントの読み方",
  "このファイルは通読しない",
])

/** 設計判断の表の行（ファイル名の昇順）。 */
export function decisionRows(adrs: readonly TitledFile[]): TableRow[] {
  return sortByFileName(adrs).map(({ fileName, title }) => [
    `\`docs/architecture/adr/${fileName}\``,
    title,
  ])
}

/**
 * 親の文書の子の一覧の行（ファイル名の昇順）。
 * 列は子のパス・1行目の `# ` の題・`##` と `###` の見出し（節の索引と読み方の案内を除く）を ` / ` でつないだもの。
 * `##`・`###` の列が兄弟と同じになる子だけは `####` まで載せる（行ごとに子を見分けるため）。
 */
export function childListRows(directory: string, children: readonly ChildFile[]): TableRow[] {
  const sorted = sortByFileName(children)
  const shallow = sorted.map(({ text }) => joinSectionTitles(text, 3))
  return sorted.map(({ fileName, text }, index) => [
    `\`${directory}/${fileName}\``,
    (text.split("\n")[0] ?? "").replace(/^# /, "").trim(),
    shallow.filter((sections) => sections === shallow[index]).length > 1
      ? joinSectionTitles(text, 4)
      : (shallow[index] ?? ""),
  ])
}

/**
 * 子の文書の節の索引の、あるべき行といま書かれている行。節の索引が無ければ `undefined`。
 * 本文の `##` の節が `MAX_SECTIONS_WITHOUT_INDEX` 以下なら索引を置かないので、あるべき行を空にし、
 * いまの行には索引の見出しの1行を入れる（索引があること自体を食い違いにする）。
 */
export function readChildIndex(
  text: string,
): { readonly expected: TableRow[]; readonly actual: TableRow[] } | undefined {
  const heading = withoutFences(text).find(isSectionIndexHeading)
  if (heading === undefined) {
    return undefined
  }
  return countSections(text) <= MAX_SECTIONS_WITHOUT_INDEX
    ? { expected: [], actual: [[heading]] }
    : { expected: sectionIndexRows(text), actual: readTableRows(text, heading) }
}

/** 子の文書の節の索引を書き直す。節が少なければ索引の節を消し、多ければ見出しから表を組む。 */
export function rewriteChildIndex(text: string): string {
  const heading = withoutFences(text).find(isSectionIndexHeading)
  if (heading === undefined) {
    return text
  }
  return countSections(text) <= MAX_SECTIONS_WITHOUT_INDEX
    ? withoutSectionIndex(text)
    : replaceTable(text, heading, SECTION_INDEX_COLUMNS, sectionIndexRows(text))
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
  return replaceTableLines(text, heading, (tableLines) => [
    ...tableLines.slice(0, 2),
    ...rows.map(renderRow),
  ])
}

/** `heading` の後の表を、見出し行 `columns` と区切り行と `rows` で書き直す。 */
export function replaceTable(
  text: string,
  heading: string,
  columns: TableRow,
  rows: readonly TableRow[],
): string {
  return replaceTableLines(text, heading, () => [
    renderRow(columns),
    renderRow(columns.map(() => "---")),
    ...rows.map(renderRow),
  ])
}

/** 子の文書の節の索引の行（`##` の節ごとに、その下の `###` を ` / ` でつないだもの。`###` の無い節も載せる）。 */
function sectionIndexRows(text: string): TableRow[] {
  return readHeadings(text).reduce<TableRow[]>((rows, { level, title }) => {
    if (level === 2) {
      return [...rows, [`## ${title}`, ""]]
    }
    const last = level === 3 ? rows.at(-1) : undefined
    if (last === undefined) {
      return rows
    }
    const [section = "", subsections = ""] = last
    return [
      ...rows.slice(0, -1),
      [section, subsections === "" ? title : `${subsections} / ${title}`],
    ]
  }, [])
}

/** 深さ `maxLevel` までの見出し（読み方の案内を除く）を ` / ` でつなぐ。 */
function joinSectionTitles(text: string, maxLevel: number): string {
  return readHeadings(text)
    .filter(({ level, title }) => level <= maxLevel && !READING_GUIDE_TITLES.has(title))
    .map(({ title }) => title)
    .join(" / ")
}

function countSections(text: string): number {
  return readHeadings(text).filter(({ level }) => level === 2).length
}

/**
 * 節の索引の節を、見出しから次の見出しの手前まで消す。
 * 次の見出しは深さを問わない（索引の直後に `###` で本文が始まる文書でも、本文を消さない）。
 */
function withoutSectionIndex(text: string): string {
  const lines = text.split("\n")
  const outside = withoutFences(text)
  const start = outside.findIndex(isSectionIndexHeading)
  if (start < 0) {
    return text
  }
  const next = outside.findIndex((line, index) => index > start && isHeading(line))
  if (next < 0) {
    return [...trimTrailingBlankLines(lines.slice(0, start)), ""].join("\n")
  }
  return [...lines.slice(0, start), ...lines.slice(next)].join("\n")
}

function replaceTableLines(
  text: string,
  heading: string,
  render: (tableLines: readonly string[]) => readonly string[],
): string {
  const lines = text.split("\n")
  const range = findTableRange(lines, heading)
  if (range === undefined) {
    return text
  }
  return [...lines.slice(0, range.start), ...render(range.lines), ...lines.slice(range.end)].join(
    "\n",
  )
}

function sortByFileName<T extends { readonly fileName: string }>(files: readonly T[]): T[] {
  return files.toSorted((a, b) => (a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0))
}

/** `##`〜`####` の見出しの深さと文字列（節の索引を除く）。 */
function readHeadings(text: string): { readonly level: number; readonly title: string }[] {
  return withoutFences(text)
    .filter((line) => /^#{2,4} /u.test(line))
    .map((line) => ({
      level: line.match(/^#+/u)?.[0].length ?? 2,
      title: line.replace(/^#+ /u, "").trim(),
    }))
    .filter(({ title }) => title !== SECTION_INDEX_TITLE)
}

function isSectionIndexHeading(line: string): boolean {
  return /^#{2,3} /u.test(line) && line.replace(/^#+ /u, "").trim() === SECTION_INDEX_TITLE
}

function isHeading(line: string): boolean {
  return /^#{1,6} /u.test(line)
}

/** 行の並びを保ったまま、コードブロックの中の行を空にする。 */
function withoutFences(text: string): string[] {
  return text.replace(/^```[\s\S]*?^```$/gmu, (block) => block.replace(/[^\n]/gu, "")).split("\n")
}

function trimTrailingBlankLines(lines: readonly string[]): string[] {
  const last = lines.findLastIndex((line) => line.trim() !== "")
  return lines.slice(0, last + 1)
}

function renderRow(cells: TableRow): string {
  return `| ${cells.join(" | ")} |`
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
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim())
}
