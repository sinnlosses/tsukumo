// ファイル方式のタスクの帳面の置き場所と、旧形式（`develop/tasks.json`・アーカイブ）の読み方。
// 成果が過去の履歴から終えたタスクと数えない帳面のパスを読むときの、パスの定義はここだけが持つ。
// ファイル I/O も `git` も触らない。
//
// 旧形式は、ファイル方式へ移す前の履歴にだけ現れる。履歴に残っているので、消すと過去の日の数が変わる。

import { isPlainObject } from "remeda"

import { TASK_DIR_PATH } from "./task-summary.ts"

/** 旧形式のタスク一覧。 */
export const LEGACY_TASKS_PATH = "develop/tasks.json"

/** 旧形式のアーカイブ。 */
export const LEGACY_ARCHIVE_PATH = "docs/history/tasks.md"

/** 登録日・消えたファイルを読む `git log` に渡すパス。 */
export const TASK_LEDGER_HISTORY_PATHS = [TASK_DIR_PATH, LEGACY_TASKS_PATH] as const

const LEDGER_FILE_PATHS: ReadonlySet<string> = new Set([
  LEGACY_TASKS_PATH,
  LEGACY_ARCHIVE_PATH,
  "develop/progress.md",
  "docs/history/progress.md",
])

/** コミットの数から外すパス（帳面のファイル）。 */
export function isTaskLedgerPath(path: string): boolean {
  return LEDGER_FILE_PATHS.has(path) || path.startsWith(TASK_DIR_PATH)
}

const TASK_FILE_PATH_PATTERN = new RegExp(`^${TASK_DIR_PATH}(T-\\d{3,})\\.md$`)

/** タスクファイルのパスから ID を取る。当てはまらなければ `undefined`。 */
export function taskFileIdOfPath(path: string): string | undefined {
  return TASK_FILE_PATH_PATTERN.exec(path)?.[1]
}

/** 旧形式の一覧の消える変更（`git log --name-status` の1行）。形式の切り替えの印。 */
export function isTaskFormatSwitchChange(change: {
  readonly status: string
  readonly path: string
}): boolean {
  return change.status === "D" && change.path === LEGACY_TASKS_PATH
}

/** 旧形式の一覧とアーカイブから `done` を拾った ID → summary。同じ ID は一覧を優先する。無いものは `undefined` を渡す。 */
export function legacyDoneTaskSummaries(
  tasksJson: string | undefined,
  archiveMarkdown: string | undefined,
): ReadonlyMap<string, string> {
  const doneTasks = new Map<string, string>()
  const tasks = [
    ...(tasksJson === undefined ? [] : oldFormatDoneTasksOf(tasksJson)),
    ...(archiveMarkdown === undefined ? [] : archivedDoneTasksOf(archiveMarkdown)),
  ]
  for (const task of tasks) {
    if (!doneTasks.has(task.id)) {
      doneTasks.set(task.id, task.summary)
    }
  }
  return doneTasks
}

type OldFormatDoneTask = { readonly id: string; readonly summary: string }

/** `passes` まで読む。 */
function oldFormatDoneTasksOf(content: string): readonly OldFormatDoneTask[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) {
    return []
  }
  return parsed.flatMap((task) => oldFormatDoneTaskOf(task))
}

function oldFormatDoneTaskOf(task: unknown): readonly OldFormatDoneTask[] {
  if (!isPlainObject(task) || typeof task.id !== "string") {
    return []
  }
  if (task.status !== "done" || task.passes !== true) {
    return []
  }
  const summary =
    typeof task.summary === "string" && task.summary !== "" ? task.summary : firstLineOf(task.task)
  return summary === undefined ? [] : [{ id: task.id, summary }]
}

function firstLineOf(value: unknown): string | undefined {
  if (typeof value !== "string" || value === "") {
    return undefined
  }
  return value.split("\n")[0]
}

/** 節の見出し（`## T-XXX <名前>` または名前無しの `## T-XXX`）。 */
const ARCHIVE_HEADING_PATTERN = /^## (T-\d{3,})[ \t]*(.*)$/
/** `passes:` の値。バックティック付き／無し、大文字小文字、`yes` の揺れをすべて拾う（アーカイブに実際に出てくる形）。 */
const ARCHIVE_PASSES_PATTERN = /\*\*passes\*\*:\s*`?([A-Za-z]+)`?/
/** 見出しに名前が無い古い節が使う「タスク: <summary>」行。 */
const ARCHIVE_TASK_LINE_PATTERN = /^\*\*タスク\*\*:\s*(.+)$/m
const ARCHIVE_PASSING_VALUES = new Set(["true", "yes"])

/**
 * アーカイブから `done`（`passes` が真）の節だけを拾う。
 * 節の境界は次の見出し（`## T-XXX`）なので、本文の中に別の `passes:` らしき文字列があっても後の節の値を誤って拾わない。
 * 壊れた・読めない節はその1件だけ読み飛ばす。
 */
function archivedDoneTasksOf(content: string): readonly OldFormatDoneTask[] {
  const sections = content.split(/\n(?=## T-\d{3,})/)
  return sections.flatMap((section) => archivedDoneTaskOfSection(section))
}

function archivedDoneTaskOfSection(section: string): readonly OldFormatDoneTask[] {
  const headingLine = section.split("\n", 1)[0] ?? ""
  const heading = ARCHIVE_HEADING_PATTERN.exec(headingLine)
  if (heading === null) {
    return []
  }
  const id = heading[1]
  if (id === undefined) {
    return []
  }

  const passesMatch = ARCHIVE_PASSES_PATTERN.exec(section)
  const passesValue = passesMatch?.[1]?.toLowerCase()
  if (passesValue === undefined || !ARCHIVE_PASSING_VALUES.has(passesValue)) {
    return []
  }

  const titleFromHeading = heading[2]?.trim()
  const summary =
    titleFromHeading !== undefined && titleFromHeading !== ""
      ? titleFromHeading
      : ARCHIVE_TASK_LINE_PATTERN.exec(section)?.[1]?.trim()

  return summary === undefined || summary === "" ? [] : [{ id, summary }]
}
