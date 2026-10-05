// `src/` / `test/` / `scripts/` / `docs/` / `story/`（`docs/history/` を除く）のコメント・テスト名・本文に
// 書かれたタスク番号（`develop/task/T-xxx.md` のパスも `T-` + 3桁以上の並びを含むので同じ形で
// 拾える。トラッカーが `github` の課題番号 `GH-<n>`、ゼロ埋めなしも拾う）を拾う純粋関数。
//
// `.beads` は git の外（`--stealth`）なので、切り替えで課題の `description` 末尾に残る
// 「旧ID: T-xxx」の行はここが読む対象（コミットされたファイル）に現れない。
//
// CLAUDE.md「コード・ドキュメントにタスク番号（`T-` + 3桁、または GitHub の Issue 番号
// `GH-<n>`）を書かない」をコードの側で裏付ける。
// 許すのは3つだけ: (1) タスクファイルの形（front matter・ID とファイル名の対応・見出しの集計）を
// 確かめるテストが、タスクIDを文字列リテラルのデータとして使うファイル（`ALLOWED_DATA_FILES`）。
// ただしファイル丸ごとではなく、出現の置き場所が `data`（コメントでもテスト名でもない）のときだけ
// 許す——同じファイルでもコメント（`//`・`/* */`・JSDoc）とテスト名（`describe`/`it`/`test` の
// 最初の文字列引数）に書かれた出現は拾う。置き場所の判定は `contextRangesOf` が行う、
// (2) 既知の例外 `T-225`、
// (3) `docs/requirements.md`「7. 未決事項」の表の「対応タスク」列（CLAUDE.md が唯一許す docs の
// 例外）。(3) は `maskAllowedRequirementsPendingTaskColumn` が、拾う前にその列だけ伏せて実現する
// （伏せた場所は 1列目や節の外まで広げない）。

/** タスク番号の出現が置かれている場所。`data` だけが `ALLOWED_DATA_FILES` の例外の対象。 */
export type TaskMentionContext = "comment" | "testName" | "data"

/** タスク番号の出現1件。 */
export type TaskMention = {
  /** 出現を書いているファイル（リポジトリ直下からの相対パス）。 */
  readonly sourcePath: string
  /** 出現がある行（1始まり）。 */
  readonly line: number
  /** 拾った ID（`T-xxx` または `GH-<n>` の形）。 */
  readonly id: string
  /** 出現が置かれている場所（コメント・テスト名・それ以外のデータ）。 */
  readonly context: TaskMentionContext
}

const TASK_ID_PATTERN = /T-\d{3,}|GH-\d+/gu

// `describe`/`it`/`test`（`.skip` などの修飾つきも）の最初の引数として開く引用符の直前まで。
// テスト名の文字列そのものは、この直後から対応する閉じ引用符までになる。
const TEST_CALL_OPENING_QUOTE_PATTERN = /\b(?:describe|it|test)(?:\.\w+)?\(\s*(["'`])/gu

const KNOWN_EXCEPTION_ID = "T-225"

// `docs/requirements.md`「7. 未決事項」の対応タスク列だけを許す例外が見る場所。
const REQUIREMENTS_PATH = "docs/requirements.md"
const PENDING_SECTION_HEADING = "## 7. 未決事項"
// ちょうどレベル2の見出し（`## `）だけに反応する。`### ` はここでは終わらない。
const SECTION_HEADING_PATTERN = /^##\s/u
// 表の区切り行（`| --- | --- |` の形）。伏せる対象から除く。
const TABLE_SEPARATOR_ROW_PATTERN = /^\|[\s|:-]+\|$/u

// タスクファイルの形を確かめるテストが、タスクIDをデータとして使うファイル。
const ALLOWED_DATA_FILES = [
  "test/task-id.test.ts",
  "test/server/achievement/core/achievement-commit.test.ts",
  "test/server/achievement/core/done-task-source.test.ts",
  "test/server/achievement/core/task-file-history.test.ts",
  "test/server/achievement/core/daily-achievement.test.ts",
  "test/server/repository/adapter/task-summary.test.ts",
  "test/server/achievement/adapter/main-history.test.ts",
  "test/shared/repository/task-file-ledger.test.ts",
  "test/shared/repository/task-summary.test.ts",
  "test/shared/repository/beads-issue.test.ts",
  "test/shared/achievement/achievement.test.ts",
  "test/e2e/task-list.test.ts",
  "test/e2e/task-board.test.ts",
  "test/e2e/task-board-jump.test.ts",
  "test/e2e/task-room.ts",
  "test/e2e/report-task.test.ts",
] as const satisfies readonly string[]

/**
 * ファイル1つの本文から、タスク番号の出現をすべて拾う。出現ごとに、コメント・テスト名・
 * それ以外のデータのどこに置かれているか（`context`）も添える。
 */
export function findTaskMentions(sourcePath: string, text: string): TaskMention[] {
  const ranges = contextRangesOf(text)
  const lineStarts = lineStartOffsetsOf(text)
  return text.split("\n").flatMap((lineText, index) =>
    [...lineText.matchAll(TASK_ID_PATTERN)].map((match) => ({
      sourcePath,
      line: index + 1,
      id: match[0],
      context: contextAt(ranges, (lineStarts[index] ?? 0) + (match.index ?? 0)),
    })),
  )
}

/**
 * 拾った出現のうち、許した範囲（既知の例外 `T-225` と、タスクファイルの形を確かめるテストの
 * データのうち `data`（コメントでもテスト名でもない）に置かれたもの）に無いものだけを返す。
 * `docs/requirements.md` の対応タスク列は、拾う前に `maskAllowedRequirementsPendingTaskColumn`
 * で伏せてあるのでここには出現しない。
 */
export function findStrayTaskMentions(mentions: readonly TaskMention[]): TaskMention[] {
  return mentions.filter(
    (mention) =>
      mention.id !== KNOWN_EXCEPTION_ID &&
      !(isAllowedDataFile(mention.sourcePath) && mention.context === "data"),
  )
}

/** 迷子のタスク番号1件を、一覧に出す1行にする。 */
export function formatStrayTaskMention(mention: TaskMention): string {
  return `${mention.sourcePath}:${mention.line}: ${mention.id}`
}

/**
 * `docs/requirements.md`「7. 未決事項」の表の「対応タスク」列（表の2列目）だけ、`findTaskMentions`
 * に渡す前にタスク番号を伏せる。伏せるのは `## 7. 未決事項` というレベル2見出しに入っている間の
 * 表データ行（区切り行を除く）の最後の列だけで、1列目（未決事項そのもの）や節の外の表・
 * このファイル以外は伏せない。
 */
export function maskAllowedRequirementsPendingTaskColumn(sourcePath: string, text: string): string {
  if (sourcePath !== REQUIREMENTS_PATH) {
    return text
  }
  const { maskedLines } = text.split("\n").reduce<{
    readonly inPendingSection: boolean
    readonly maskedLines: readonly string[]
  }>(
    (accumulator, lineText) => {
      if (SECTION_HEADING_PATTERN.test(lineText)) {
        return {
          inPendingSection: lineText.trim() === PENDING_SECTION_HEADING,
          maskedLines: [...accumulator.maskedLines, lineText],
        }
      }
      const maskedLine = accumulator.inPendingSection ? maskLastTableCell(lineText) : lineText
      return { ...accumulator, maskedLines: [...accumulator.maskedLines, maskedLine] }
    },
    { inPendingSection: false, maskedLines: [] },
  )
  return maskedLines.join("\n")
}

function isAllowedDataFile(path: string): boolean {
  return (ALLOWED_DATA_FILES as readonly string[]).includes(path)
}

/** 表データ行1行の、最後の列に書かれたタスク番号だけを伏せる。表データ行でなければそのまま返す。 */
function maskLastTableCell(lineText: string): string {
  if (!lineText.startsWith("|") || !lineText.endsWith("|")) {
    return lineText
  }
  if (TABLE_SEPARATOR_ROW_PATTERN.test(lineText)) {
    return lineText
  }
  const lastPipeIndex = lineText.length - 1
  const secondLastPipeIndex = lineText.lastIndexOf("|", lastPipeIndex - 1)
  if (secondLastPipeIndex <= 0) {
    return lineText
  }
  const before = lineText.slice(0, secondLastPipeIndex + 1)
  const cell = lineText.slice(secondLastPipeIndex + 1, lastPipeIndex)
  const after = lineText.slice(lastPipeIndex)
  return `${before}${cell.replaceAll(TASK_ID_PATTERN, "")}${after}`
}

/** 出現の置き場所の範囲1件（`text` の中の絶対位置）。 */
type MentionContextRange = {
  readonly start: number
  readonly end: number
  readonly context: Exclude<TaskMentionContext, "data">
}

/**
 * `text` の中で、コメント（行コメントとブロックコメント）とテスト名の範囲をすべて求める。
 * 範囲に無い出現は `contextAt` が `data` として返す。
 */
function contextRangesOf(text: string): readonly MentionContextRange[] {
  const commentRanges = commentRangesOf(text)
  const codeText = maskRanges(text, commentRanges)
  return [...commentRanges, ...testNameRangesOf(codeText)]
}

/** 絶対位置 `index` に置かれた出現の場所（`ranges` の外なら `data`）。 */
function contextAt(ranges: readonly MentionContextRange[], index: number): TaskMentionContext {
  const range = ranges.find((candidate) => index >= candidate.start && index < candidate.end)
  return range === undefined ? "data" : range.context
}

/**
 * `text` の中の行コメント・ブロックコメント（JSDoc を含む）の範囲を、文字列リテラルの中身は
 * 除いて求める。
 */
function commentRangesOf(text: string): MentionContextRange[] {
  const ranges: MentionContextRange[] = []
  let quote = ""
  let index = 0
  while (index < text.length) {
    if (quote !== "") {
      if (text[index] === "\\") {
        index += 2
        continue
      }
      if (text[index] === quote) {
        quote = ""
      }
      index += 1
      continue
    }
    const ch = text[index]
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch
      index += 1
      continue
    }
    if (ch === "/" && text[index + 1] === "/") {
      const newlineIndex = text.indexOf("\n", index)
      const end = newlineIndex === -1 ? text.length : newlineIndex
      ranges.push({ start: index, end, context: "comment" })
      index = end
      continue
    }
    if (ch === "/" && text[index + 1] === "*") {
      const closeIndex = text.indexOf("*/", index + 2)
      const end = closeIndex === -1 ? text.length : closeIndex + 2
      ranges.push({ start: index, end, context: "comment" })
      index = end
      continue
    }
    index += 1
  }
  return ranges
}

/** `ranges` に当たる部分を、同じ長さの空白で覆う（あとの走査からコメントの中身を除くため）。 */
function maskRanges(text: string, ranges: readonly MentionContextRange[]): string {
  return ranges.reduce(
    (masked, range) =>
      masked.slice(0, range.start) + " ".repeat(range.end - range.start) + masked.slice(range.end),
    text,
  )
}

/**
 * コメントを覆ったあとの `codeText` から、`describe`/`it`/`test` の最初の文字列引数
 * （テスト名）の範囲をすべて求める。
 */
function testNameRangesOf(codeText: string): MentionContextRange[] {
  return [...codeText.matchAll(TEST_CALL_OPENING_QUOTE_PATTERN)].map((match) => {
    const quote = match[1] ?? ""
    const contentStart = (match.index ?? 0) + match[0].length
    return {
      start: contentStart,
      end: closingQuoteIndexOf(codeText, contentStart, quote),
      context: "testName",
    }
  })
}

/** `start` から見て、エスケープを飛ばしつつ最初に現れる `quote` の位置（無ければ末尾）。 */
function closingQuoteIndexOf(text: string, start: number, quote: string): number {
  let index = start
  while (index < text.length) {
    if (text[index] === "\\") {
      index += 2
      continue
    }
    if (text[index] === quote) {
      return index
    }
    index += 1
  }
  return text.length
}

/** `text` の各行（0始まりの添字）が始まる絶対位置。 */
function lineStartOffsetsOf(text: string): number[] {
  return [0, ...[...text.matchAll(/\n/gu)].map((match) => (match.index ?? 0) + 1)]
}
