// `src/` / `test/` / `scripts/` / `docs/`（`docs/history/` を除く）のコメント・テスト名・本文に
// 書かれたタスク番号（`develop/task/T-xxx.md` のパスも `T-` + 3桁以上の並びを含むので同じ形で
// 拾える）を拾う純粋関数。`scripts/lib/task-mention-repository.ts`（リポジトリから集める入口）と
// `test/task-id.test.ts`（0件を保つテスト）が使う。
//
// CLAUDE.md「コード・ドキュメントにタスク番号（`T-` + 3桁）を書かない」をコードの側で裏付ける。
// 許すのは3つだけ: (1) タスクファイルの形（front matter・ID とファイル名の対応・見出しの集計）を
// 確かめるテストが、タスクIDをデータとして使うファイル（`ALLOWED_DATA_FILES`）、
// (2) 既知の例外 `T-225`（`scripts/task-id.ts` と同じ理由でここでも例外にする）、
// (3) `docs/requirements.md`「7. 未決事項」の表の「対応タスク」列（CLAUDE.md が唯一許す docs の
// 例外）。(3) は `maskAllowedRequirementsPendingTaskColumn` が、拾う前にその列だけ伏せて実現する
// （伏せた場所は 1列目や節の外まで広げない）。

/** タスク番号の出現1件。 */
export type TaskMention = {
  /** 出現を書いているファイル（リポジトリ直下からの相対パス）。 */
  readonly sourcePath: string
  /** 出現がある行（1始まり）。 */
  readonly line: number
  /** 拾った ID（`T-xxx` の形）。 */
  readonly id: string
}

const TASK_ID_PATTERN = /T-\d{3,}/gu

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
  "test/scripts/task-id.test.ts",
  "test/server/achievement/core/achievement.test.ts",
  "test/server/repository/adapter/task-summary.test.ts",
  "test/server/achievement/adapter/main-history.test.ts",
  "test/shared/task-summary.test.ts",
  "test/shared/achievement.test.ts",
  "test/e2e/task-list.test.ts",
] as const satisfies readonly string[]

/**
 * ファイル1つの本文から、タスク番号の出現をすべて拾う。
 */
export function findTaskMentions(sourcePath: string, text: string): TaskMention[] {
  const lines = text.split("\n")
  return lines.flatMap((lineText, index) =>
    [...lineText.matchAll(TASK_ID_PATTERN)].map((match) => ({
      sourcePath,
      line: index + 1,
      id: match[0],
    })),
  )
}

/**
 * 拾った出現のうち、許した範囲（既知の例外 `T-225` と、タスクファイルの形を確かめるテストの
 * データ）に無いものだけを返す。`docs/requirements.md` の対応タスク列は、拾う前に
 * `maskAllowedRequirementsPendingTaskColumn` で伏せてあるのでここには出現しない。
 */
export function findStrayTaskMentions(mentions: readonly TaskMention[]): TaskMention[] {
  return mentions.filter(
    (mention) => mention.id !== KNOWN_EXCEPTION_ID && !isAllowedDataFile(mention.sourcePath),
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
