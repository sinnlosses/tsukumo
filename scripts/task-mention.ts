// `src/` / `test/` / `scripts/` のコメント・テスト名に書かれたタスク番号（`develop/task/T-xxx.md`
// のパスも `T-` + 3桁以上の並びを含むので同じ形で拾える）を拾う純粋関数。
// `scripts/lib/task-mention-repository.ts`（リポジトリから集める入口）と
// `test/task-id.test.ts`（0件を保つテスト）が使う。
//
// CLAUDE.md「コード・ドキュメントにタスク番号（`T-` + 3桁）を書かない」をコードの側で裏付ける。
// 許すのは2つだけ: (1) タスクファイルの形（front matter・ID とファイル名の対応・見出しの集計）を
// 確かめるテストが、タスクIDをデータとして使うファイル（`ALLOWED_DATA_FILES`）、
// (2) 既知の例外 `T-225`（`scripts/task-id.ts` と同じ理由でここでも例外にする）。

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

// タスクファイルの形を確かめるテストが、タスクIDをデータとして使うファイル。
const ALLOWED_DATA_FILES = [
  "test/task-id.test.ts",
  "test/scripts/task-id.test.ts",
  "test/server/core/achievement.test.ts",
  "test/server/repository/adapter/task-summary.test.ts",
  "test/server/adapter/main-history.test.ts",
  "test/shared/task-summary.test.ts",
  "test/shared/achievement.test.ts",
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
 * データ）に無いものだけを返す。
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

function isAllowedDataFile(path: string): boolean {
  return (ALLOWED_DATA_FILES as readonly string[]).includes(path)
}
