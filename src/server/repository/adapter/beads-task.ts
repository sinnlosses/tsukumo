// Beads の課題を、組み込みの欄と metadata の `difficulty`・`loopable` からタスク一般の形（一覧の要約と、終えたタスク）に写す。
//
// ここはファイルI/Oも `bd` も持たない。

import { sortBy } from "remeda"

import type {
  DoneTask,
  TaskLocation,
  TaskSummaryItem,
  TaskSummaryResult,
} from "../../../shared/repository/task-summary.ts"
import type { BeadsIssue } from "./beads.ts"

/**
 * タスクの一覧に出す要約。閉じていない課題はすべて出し、閉じた課題は `closedAtEpochMilliseconds`
 * の新しいものから {@link CLOSED_TASK_DISPLAY_LIMIT} 件だけ出す。
 * 並びは ID の番号の昇順で、番号の取れない ID は末尾に作った時刻の順（同じ時刻なら ID の順）。
 */
export function taskSummaryItemsOfBeadsIssues(
  issues: readonly BeadsIssue[],
): readonly TaskSummaryItem[] {
  const unfinishedIssues = issues.filter((issue) => issue.status !== CLOSED_STATUS)
  const closed = sortBy(
    issues.filter((issue) => issue.status === CLOSED_STATUS),
    [(issue) => issue.closedAtEpochMilliseconds ?? 0, "desc"],
  ).slice(0, CLOSED_TASK_DISPLAY_LIMIT)
  const unfinished = new Set(unfinishedIssues.map((issue) => issue.id))

  return sortBy(
    [...unfinishedIssues, ...closed],
    [(issue) => numberOfTaskId(issue.id) === undefined, "asc"],
    [(issue) => numberOfTaskId(issue.id) ?? 0, "asc"],
    [(issue) => issue.createdAtEpochMilliseconds, "asc"],
    [(issue) => issue.id, "asc"],
  ).map((issue) => taskSummaryItemOfBeadsIssue(issue, unfinished))
}

/**
 * 読めた一覧の結果。{@link taskSummaryItemsOfBeadsIssues} の一覧に、閉じた課題を上限で落としたときだけ落とした件数を添える
 * （落としていなければ `omittedClosedCount` は付けない）。
 */
export function knownTaskSummaryOfBeadsIssues(
  issues: readonly BeadsIssue[],
): Extract<TaskSummaryResult, { readonly kind: "known" }> {
  const items = taskSummaryItemsOfBeadsIssues(issues)
  const closedCount = issues.filter((issue) => issue.status === CLOSED_STATUS).length
  const omittedClosedCount = Math.max(0, closedCount - CLOSED_TASK_DISPLAY_LIMIT)
  return omittedClosedCount === 0
    ? { kind: "known", items }
    : { kind: "known", items, omittedClosedCount }
}

/** 閉じた課題のうち閉じた時刻のあるものを、閉じた時刻の順に（同じ時刻なら ID の順に）並べる。 */
export function doneTasksOfBeadsIssues(issues: readonly BeadsIssue[]): readonly DoneTask[] {
  const done = issues.flatMap((issue) =>
    issue.status === CLOSED_STATUS && issue.closedAtEpochMilliseconds !== undefined
      ? [
          {
            id: issue.id,
            summary: issue.title,
            createdAtEpochMilliseconds: issue.createdAtEpochMilliseconds,
            closedAtEpochMilliseconds: issue.closedAtEpochMilliseconds,
          },
        ]
      : [],
  )
  return sortBy(done, [(task) => task.closedAtEpochMilliseconds, "asc"], [(task) => task.id, "asc"])
}

/** ID の末尾の番号。採番前の ID（`gh-new-…` など）のように番号で終わらない ID は `undefined`。 */
function numberOfTaskId(id: string): number | undefined {
  const matched = /^[A-Za-z]+-(\d+)$/.exec(id)
  return matched?.[1] === undefined ? undefined : Number(matched[1])
}

/** 依存のうち `unfinished`（閉じていない課題の ID）に無いもの（閉じた課題・課題に無い ID）は着手を止めない。 */
function taskSummaryItemOfBeadsIssue(
  issue: BeadsIssue,
  unfinished: ReadonlySet<string>,
): TaskSummaryItem {
  return {
    id: issue.id,
    summary: issue.title,
    status: taskStatusOf(issue),
    dependencies: issue.blockedBy,
    waitingFor:
      issue.status === CLOSED_STATUS ? [] : issue.blockedBy.filter((id) => unfinished.has(id)),
    labels: issue.labels,
    difficulty: issue.difficulty,
    loopable: issue.loopable,
    body: bodyOfBeadsIssue(issue),
    location: locationOfBeadsIssue(issue),
  }
}

/** ドラフトの印は、着手前（`open`・`deferred`）の課題でだけ状態になる。 */
function taskStatusOf(issue: BeadsIssue): string {
  if (issue.draft && (issue.status === "open" || issue.status === "deferred")) {
    return "draft"
  }
  return TASK_STATUS_OF_BEADS_STATUS.get(issue.status) ?? issue.status
}

/** 課題の `external_ref` が `https://` で始まる URL のときだけそれを置き場所にする。 */
function locationOfBeadsIssue(issue: BeadsIssue): TaskLocation {
  return issue.externalRef !== undefined && issue.externalRef.startsWith("https://")
    ? { kind: "issue", url: issue.externalRef }
    : { kind: "none" }
}

/**
 * `description` を見出しを付けずに置き、`acceptance_criteria`・`notes` をこの順に見出しを付けて続ける。
 * 中身が空の欄は見出しごと出さない。
 */
function bodyOfBeadsIssue(issue: BeadsIssue): string {
  const blocks = [
    trimNewlines(issue.description),
    sectionOf(ACCEPTANCE_HEADING, issue.acceptanceCriteria),
    sectionOf(NOTES_HEADING, issue.notes),
  ].filter((block) => block !== "")
  return blocks.length === 0 ? "" : `${blocks.join("\n\n")}\n`
}

function sectionOf(heading: string, content: string): string {
  const trimmed = trimNewlines(content)
  return trimmed === "" ? "" : `${heading}\n\n${trimmed}`
}

/** 改行だけを前後から落とす（字下げなどほかの空白は残す）。 */
function trimNewlines(value: string): string {
  return value.replace(/^\n+/, "").replace(/\n+$/, "")
}

const ACCEPTANCE_HEADING = "## 受け入れ条件"
const NOTES_HEADING = "## メモ"

const CLOSED_STATUS = "closed"
/** タスク板に残す、閉じた課題の件数。 */
const CLOSED_TASK_DISPLAY_LIMIT = 10

/** Beads の組み込みの状態の読み替え。表に無い状態は Beads の語のまま出す。 */
const TASK_STATUS_OF_BEADS_STATUS: ReadonlyMap<string, string> = new Map([
  ["open", "todo"],
  ["in_progress", "doing"],
  ["deferred", "hold"],
  [CLOSED_STATUS, "done"],
])
