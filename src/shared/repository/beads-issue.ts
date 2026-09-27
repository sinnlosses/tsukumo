// Beads（`bd`）の課題1件を、タスクの一覧と成果が読む形に写す。「読む」層。
// 対応は task-workflow の WORKFLOW.md「Beads 方式」の表が正典
// （`open` → `todo`・`pending` → `hold`・`in_progress` → 着手中・`closed` → `done`、label `cancelled` があれば `dropped`）。
//
// ここはファイルI/Oも `bd` も持たない。`bd` を起こして JSON を検証するのは `readBeadsIssues`。

import { sortBy } from "remeda"

import type { TaskSummaryItem } from "./task-summary.ts"

/**
 * `bd list --json` の1件のうち、この読み手が使う欄だけ。本文（description など）と作成者（owner）は
 * 持たない。`assignee` は着手した作業ツリーの名前で、`closedAt` は閉じた時刻（エポックミリ秒）。
 * どちらも Beads の側で無ければ `undefined`（外の世界の「無い」をそのまま写したもの）。
 */
export type BeadsIssue = {
  readonly id: string
  readonly title: string
  readonly status: string
  readonly labels: readonly string[]
  /** `blocks` の依存先の Beads ID。 */
  readonly blockedBy: readonly string[]
  readonly assignee: string | undefined
  readonly createdAtEpochMilliseconds: number
  readonly closedAtEpochMilliseconds: number | undefined
}

/**
 * タスクの一覧に出す要約。閉じていない課題はすべて出し、閉じた課題は `closedAtEpochMilliseconds`
 * の新しいものから {@link CLOSED_TASK_DISPLAY_LIMIT} 件だけ出す。
 * 閉じた課題は `done`（label `cancelled` があれば `dropped`）で出し、`unfinishedTaskIds` は
 * どちらも完了扱いにするので `taskReadiness` を止めない。
 * 並びは番号の順で、番号でない ID（トラッカーから取り込んだ振り分け前のもの）は後ろに ID の順で付く。
 */
export function taskSummaryItemsOfBeadsIssues(
  issues: readonly BeadsIssue[],
): readonly TaskSummaryItem[] {
  const unfinished = issues.filter((issue) => issue.status !== CLOSED_STATUS)
  const closed = sortBy(
    issues.filter((issue) => issue.status === CLOSED_STATUS),
    [(issue) => issue.closedAtEpochMilliseconds ?? 0, "desc"],
  ).slice(0, CLOSED_TASK_DISPLAY_LIMIT)

  return sortByTaskId([...unfinished, ...closed].map(taskSummaryItemOfBeadsIssue))
}

function taskSummaryItemOfBeadsIssue(issue: BeadsIssue): TaskSummaryItem {
  return {
    id: taskIdOfBeadsId(issue.id),
    summary: issue.title,
    status: statusOfBeadsIssue(issue),
    difficulty: labelValueOf(issue.labels, DIFFICULTY_LABEL_PREFIX),
    loopable: labelValueOf(issue.labels, LOOPABLE_LABEL_PREFIX),
    dependencies: issue.blockedBy.map(taskIdOfBeadsId),
    assignee: issue.assignee,
  }
}

/** 閉じた課題は `done`／`dropped` に、それ以外は開いた状態の読み替えに直す。 */
function statusOfBeadsIssue(issue: BeadsIssue): string {
  if (issue.status === CLOSED_STATUS) {
    return issue.labels.includes(CANCELLED_LABEL) ? "dropped" : "done"
  }
  return TASK_STATUS_OF_BEADS_STATUS.get(issue.status) ?? issue.status
}

/**
 * `beforeEpochMilliseconds` より前に閉じた課題のうち `dropped`（label `cancelled`）でないものを、
 * タスクID → summary で返す（成果の「`done` になった日」の Beads の側）。並びはタスク一覧と同じ
 * 番号の順（`bd` が返す順は作った順の逆で、画面に出す順として意味が無い）。
 */
export function closedBeadsTaskSummariesBefore(
  issues: readonly BeadsIssue[],
  beforeEpochMilliseconds: number,
): ReadonlyMap<string, string> {
  const closed = issues
    .filter(
      (issue) =>
        issue.status === CLOSED_STATUS &&
        !issue.labels.includes(CANCELLED_LABEL) &&
        issue.closedAtEpochMilliseconds !== undefined &&
        issue.closedAtEpochMilliseconds < beforeEpochMilliseconds,
    )
    .map((issue) => ({ id: taskIdOfBeadsId(issue.id), summary: issue.title }))
  return new Map(sortByTaskId(closed).map((task) => [task.id, task.summary]))
}

/** Beads の番号の ID（`t-` + 数字）をタスクID（`T-` + 数字）にする。番号でない ID はそのまま。 */
export function taskIdOfBeadsId(beadsId: string): string {
  const digits = BEADS_NUMBERED_ID_PATTERN.exec(beadsId)?.[1]
  return digits === undefined ? beadsId : `T-${digits}`
}

const CLOSED_STATUS = "closed"
const CANCELLED_LABEL = "cancelled"
/** タスク板に残す、閉じた課題の件数（`done` と `dropped` を合わせて数える）。 */
const CLOSED_TASK_DISPLAY_LIMIT = 10
const DIFFICULTY_LABEL_PREFIX = "difficulty:"
const LOOPABLE_LABEL_PREFIX = "loopable:"
const BEADS_NUMBERED_ID_PATTERN = /^t-(\d{3,})$/

/** 閉じていない状態の読み替え。表に無い状態（`blocked` など）は Beads の語のまま出す。 */
const TASK_STATUS_OF_BEADS_STATUS = new Map<string, string>([
  ["open", "todo"],
  ["pending", "hold"],
  ["in_progress", "doing"],
])

function labelValueOf(labels: readonly string[], prefix: string): string | undefined {
  return labels.find((label) => label.startsWith(prefix))?.slice(prefix.length)
}

/** 番号の順に並べ、番号でない ID は後ろに ID の順で付ける。 */
function sortByTaskId<T extends { readonly id: string }>(tasks: readonly T[]): readonly T[] {
  return sortBy(tasks, [(task) => taskNumberOf(task.id), "asc"], [(task) => task.id, "asc"])
}

/** タスクIDの数字の部分。番号でない ID は並びの最後に落とす。 */
function taskNumberOf(taskId: string): number {
  const digits = /^T-(\d+)$/.exec(taskId)?.[1]
  return digits === undefined ? Number.POSITIVE_INFINITY : Number(digits)
}
