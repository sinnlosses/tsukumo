// 成果がコミットの数から外す、運用の帳面のファイルのパス。
// ファイル I/O も `git` も触らない。
//
// 旧形式の一覧とアーカイブは、ファイル方式へ移す前の履歴にだけ現れる。履歴に残っているので、外すと過去の日のコミットの数が変わる。

/** ファイル方式のタスクファイルの置き場所。`main` からの相対パス。 */
const TASK_DIR_PATH = "develop/task/"

const LEDGER_FILE_PATHS: ReadonlySet<string> = new Set([
  "develop/tasks.json",
  "docs/history/tasks.md",
  "develop/progress.md",
  "docs/history/progress.md",
])

/** コミットの数から外すパス（帳面のファイル）。 */
export function isTaskLedgerPath(path: string): boolean {
  return LEDGER_FILE_PATHS.has(path) || path.startsWith(TASK_DIR_PATH)
}
