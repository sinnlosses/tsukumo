// ADR の一覧表・親の文書の目次を、元の題と責務の行から組み立てる純粋関数。子の文書の節の索引は消す。
// 表の範囲は、指定した見出しより後で最初に現れる `|` で始まる連続した行。
// 見出しはコードブロックの外の行だけを数える。

/** 一覧に載せる文書1件（ADR。ファイル名と、1行目の `# ` の題と、その次の空でない行のステータス。無い・不正なら空文字）。 */
export type TitledFile = {
  readonly fileName: string
  readonly title: string
  readonly status: string
}

/** 親の一覧に載せる子のファイル1件（ファイル名と本文）。 */
export type ChildFile = {
  readonly fileName: string
  readonly text: string
}

export type TableRow = readonly string[]

export const DECISION_TABLE_HEADING = "## 設計判断（なぜ今の形なのか）"
export const DECISION_TABLE_COLUMNS = ["ファイル", "判断", "ステータス"] as const satisfies TableRow
export const CHILD_LIST_HEADING = "## 目次"
export const CHILD_LIST_COLUMNS = ["ファイル", "説明"] as const satisfies TableRow

const SECTION_INDEX_TITLE = "節の索引"

/** 設計判断の表の行（ファイル名の昇順）。 */
export function decisionRows(adrs: readonly TitledFile[]): TableRow[] {
  return sortByFileName(adrs).map(({ fileName, title, status }) => [
    `\`docs/architecture/adr/${fileName}\``,
    title,
    status,
  ])
}

const ADR_STATUS_PATTERN = /^ステータス: (採用|置き換え済み（→ \d{4}）|廃止)$/u

/**
 * ADR の題の次の空でない行のステータスの値（`採用`・`置き換え済み（→ 00NN）`・`廃止`）。
 * 整形が題の直後に空行を入れるので、空行は読み飛ばす。その行が無い・形が違えば `undefined`。
 */
export function readAdrStatus(text: string): string | undefined {
  const next = text
    .split("\n")
    .slice(1)
    .find((line) => line.trim() !== "")
  return ADR_STATUS_PATTERN.exec(next ?? "")?.[1]
}

/**
 * 親の文書の目次の行（ファイル名の昇順）。列は子のパスと1行の説明。
 * 説明は `責務:` の行の最初の文で、その行が無い子は1行目の `# ` の題。
 */
export function childListRows(directory: string, children: readonly ChildFile[]): TableRow[] {
  return sortByFileName(children).map(({ fileName, text }) => [
    `\`${directory}/${fileName}\``,
    describeChild(text),
  ])
}

/**
 * 子の文書に節の索引があれば、あるべき行を空、いまの行を索引の見出しの1行にして返す
 * （索引があること自体を食い違いにする）。無ければ `undefined`。
 */
export function readChildIndex(
  text: string,
): { readonly expected: TableRow[]; readonly actual: TableRow[] } | undefined {
  const heading = withoutFences(text).find(isSectionIndexHeading)
  return heading === undefined ? undefined : { expected: [], actual: [[heading]] }
}

/** 子の文書の節の索引の節を消す。無ければ変えない。 */
export function rewriteChildIndex(text: string): string {
  return withoutFences(text).some(isSectionIndexHeading) ? withoutSectionIndex(text) : text
}

/** `heading` の後の表の、見出し行と区切り行を除いたセルの中身（前後の空白なし）。 */
export function readTableRows(text: string, heading: string): TableRow[] {
  const range = findTableRange(text.split("\n"), heading)
  if (range === undefined) {
    return []
  }
  return range.lines.slice(2).map(parseRow)
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

function describeChild(text: string): string {
  const responsibility = withoutFences(text)
    .find((line) => line.startsWith("責務:"))
    ?.replace(/^責務:\s*/u, "")
  const firstSentence = responsibility?.match(/^.*?。/u)?.[0] ?? responsibility
  const description =
    firstSentence !== undefined && firstSentence !== ""
      ? firstSentence
      : (text.split("\n")[0] ?? "").replace(/^# /, "").trim()
  return description.replaceAll("|", "\\|")
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
    .split(/(?<!\\)\|/u)
    .map((cell) => cell.trim())
}
