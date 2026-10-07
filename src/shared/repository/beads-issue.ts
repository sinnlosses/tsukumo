// Beads（`bd`）の課題1件を、タスクの一覧と成果と帯の段取りが読む形に写す。
// 対応は task-workflow の WORKFLOW.md「Beads 方式」の表が正典
// （`open` → `todo`・`pending`／`deferred` → `hold`・`in_progress` → 着手中・`closed` → `done`、
// label `cancelled` があれば `dropped`）。ID は `issue_prefix` が `t` なら `t-<n>` → `T-<n>`、
// `gh` なら `gh-<n>` → `GH-<n>`（`taskIdOfBeadsId`）。
//
// ここはファイルI/Oも `bd` も持たない。

import { isIncludedIn, sortBy } from "remeda"

import type { TaskLocation, TaskSummaryItem } from "./task-summary.ts"

/**
 * `bd list --json` の1件のうち、この読み手が使う欄だけ。
 * `assignee` は着手した作業ツリーの名前で、`closedAt` は閉じた時刻（エポックミリ秒）。どちらも Beads の側で無ければ `undefined`（外の世界の「無い」をそのまま写したもの）。
 * `description`・`acceptanceCriteria`・`notes` は本文の枠の節（{@link composeBeadsBody} が組む）、`externalRef` は置き場所に使う生の値で、無ければ空文字列／`undefined`。
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
  readonly description: string
  readonly acceptanceCriteria: string
  readonly notes: string
  readonly externalRef: string | undefined
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
    body: composeBeadsBody(issue.description, issue.acceptanceCriteria, issue.notes),
    location: locationOfBeadsIssue(issue),
  }
}

/** 課題の `external_ref` が `https://` で始まる URL のときだけそれを置き場所にする。 */
function locationOfBeadsIssue(issue: BeadsIssue): TaskLocation {
  return issue.externalRef !== undefined && issue.externalRef.startsWith("https://")
    ? { kind: "issue", url: issue.externalRef }
    : { kind: "none" }
}

/** 閉じた課題は `done`／`dropped` に、それ以外は開いた状態の読み替えに直す。 */
function statusOfBeadsIssue(issue: BeadsIssue): string {
  if (issue.status === CLOSED_STATUS) {
    return issue.labels.includes(CANCELLED_LABEL) ? "dropped" : "done"
  }
  return TASK_STATUS_OF_BEADS_STATUS.get(issue.status) ?? issue.status
}

/**
 * `beforeEpochMilliseconds` より前に閉じた課題のうち `dropped`（label `cancelled`）でないものを、タスクID → summary で返す。
 * 並びはタスク一覧と同じ番号の順（`bd` が返す順は作った順の逆で、画面に出す順として意味が無い）。
 */
export function closedBeadsTaskSummariesBefore(
  issues: readonly BeadsIssue[],
  beforeEpochMilliseconds: number,
): ReadonlyMap<string, string> {
  const closed = doneBeadsIssues(issues)
    .filter((issue) => issue.closedAtEpochMilliseconds < beforeEpochMilliseconds)
    .map((issue) => ({ id: taskIdOfBeadsId(issue.id), summary: issue.title }))
  return new Map(sortByTaskId(closed).map((task) => [task.id, task.summary]))
}

/** 閉じた課題のうち `dropped`（label `cancelled`）でないものの、閉じた時刻（エポックミリ秒）。 */
export function doneBeadsTaskClosedAtEpochMilliseconds(
  issues: readonly BeadsIssue[],
): readonly number[] {
  return doneBeadsIssues(issues).map((issue) => issue.closedAtEpochMilliseconds)
}

function doneBeadsIssues(
  issues: readonly BeadsIssue[],
): readonly (BeadsIssue & { readonly closedAtEpochMilliseconds: number })[] {
  return issues.flatMap((issue) =>
    issue.status === CLOSED_STATUS &&
    !issue.labels.includes(CANCELLED_LABEL) &&
    issue.closedAtEpochMilliseconds !== undefined
      ? [{ ...issue, closedAtEpochMilliseconds: issue.closedAtEpochMilliseconds }]
      : [],
  )
}

/**
 * Beads の番号の ID をタスクIDにする（`t-` + 3桁以上の数字は `T-` + 数字、`gh-` + 数字
 * （ゼロ埋めなし）は `GH-` + 数字。どちらの形かは Beads の `issue_prefix` で決まる。
 * 番号でない ID（振り分け前の取り込み）はそのまま）。
 */
export function taskIdOfBeadsId(beadsId: string): string {
  const tDigits = BEADS_NUMBERED_T_ID_PATTERN.exec(beadsId)?.[1]
  if (tDigits !== undefined) {
    return `T-${tDigits}`
  }
  const ghDigits = BEADS_NUMBERED_GH_ID_PATTERN.exec(beadsId)?.[1]
  return ghDigits === undefined ? beadsId : `GH-${ghDigits}`
}

/** この作業ツリーが着手したタスクの段。読めない・決められないときは `none`。 */
export type ClaimedTaskSteps =
  | { readonly kind: "none" }
  | { readonly kind: "claimed"; readonly taskId: string; readonly steps: readonly string[] }

/**
 * `status` が `in_progress` で `assignee` が `worktreeName` の課題がちょうど1件で、
 * その `## やること`（`notes`）に段が1つ以上あるときだけ、その課題の ID と段の名前を返す。
 */
export function claimedTaskStepsOf(
  issues: readonly BeadsIssue[],
  worktreeName: string,
): ClaimedTaskSteps {
  const claimed = issues.filter(
    (issue) => issue.status === IN_PROGRESS_STATUS && issue.assignee === worktreeName,
  )
  const [only] = claimed
  if (only === undefined || claimed.length > 1) {
    return { kind: "none" }
  }
  const steps = planStepNamesOf(only.notes)
  return steps.length === 0
    ? { kind: "none" }
    : { kind: "claimed", taskId: taskIdOfBeadsId(only.id), steps }
}

/**
 * `## やること` の中身から、`### <n>. <名前>` の行の名前を書かれた順に読む。
 * 番号の無い `### ` の小見出しと、`#### ` より深い見出しは段に数えない。
 */
function planStepNamesOf(plan: string): readonly string[] {
  return plan.split("\n").flatMap((line) => {
    const name = PLAN_STEP_HEADING_PATTERN.exec(line)?.[1]?.trim()
    return name === undefined || name === "" ? [] : [name]
  })
}

/**
 * 課題の `description`・`acceptanceCriteria`・`notes` を `task show` と同じ並びに組む。
 * task-workflow の `beads.py` の `compose_body`・`_sections`（`taskfile.SECTION_HEADINGS`）の写しで、あちらを変えたら揃える。
 * 枠の7節をこの順に必ず置き（中身が空でも見出しだけ出す）、枠の外の見出しはそのあと。
 * `## 結果`（Beads の comment）は `bd list` に載らないので持たない。
 */
export function composeBeadsBody(description: string, acceptance: string, notes: string): string {
  const { preamble, sections } = sectionsOf(description)
  const contents = new Map(sections)
  contents.set(ACCEPTANCE_HEADING, trimNewlines(acceptance))
  contents.set(PLAN_HEADING, trimNewlines(notes))

  const framedBlocks = SECTION_HEADINGS.map(
    (heading) => [heading, contents.get(heading) ?? ""] as const,
  )
  const extraBlocks = sections.filter(([heading]) => !isIncludedIn(heading, SECTION_HEADINGS))
  const blocks = [...framedBlocks, ...extraBlocks]

  const parts = preamble.trim() === "" ? [] : [trimNewlines(preamble)]
  for (const [heading, content] of blocks) {
    parts.push(content === "" ? heading : `${heading}\n\n${content}`)
  }
  const text = parts.join("\n\n")
  return text === "" ? "" : `${text}\n`
}

/** 本文の枠の7節（task-workflow の `taskfile.SECTION_HEADINGS` の写し）。 */
const PLAN_HEADING = "## やること"
const ACCEPTANCE_HEADING = "## 完了条件"
const SECTION_HEADINGS = [
  "## 目的・背景",
  "## 決まっていること（蒸し返さない）",
  "## 解くべき論点",
  PLAN_HEADING,
  ACCEPTANCE_HEADING,
  "## 注意",
  "## 参考情報",
] as const

/** `(見出しより前, [(見出しの行, 中身), ...])`。見出しは行頭の `## `。中身は前後の改行だけ落とす。 */
function sectionsOf(text: string): {
  readonly preamble: string
  readonly sections: readonly (readonly [string, string])[]
} {
  const preambleLines: string[] = []
  const sections: { heading: string; lines: string[] }[] = []
  for (const line of text.split("\n")) {
    if (line.startsWith("## ")) {
      sections.push({ heading: line.trimEnd(), lines: [] })
    } else if (sections.length > 0) {
      sections[sections.length - 1]?.lines.push(line)
    } else {
      preambleLines.push(line)
    }
  }
  return {
    preamble: preambleLines.join("\n"),
    sections: sections.map((section) => [section.heading, trimNewlines(section.lines.join("\n"))]),
  }
}

/** Python の `str.strip("\n")` と同じ（改行だけを前後から落とし、ほかの空白は残す）。 */
function trimNewlines(value: string): string {
  return value.replace(/^\n+/, "").replace(/\n+$/, "")
}

const CLOSED_STATUS = "closed"
const IN_PROGRESS_STATUS = "in_progress"
const PLAN_STEP_HEADING_PATTERN = /^### \d+\. (.+)$/
const CANCELLED_LABEL = "cancelled"
/** タスク板に残す、閉じた課題の件数（`done` と `dropped` を合わせて数える）。 */
const CLOSED_TASK_DISPLAY_LIMIT = 10
const DIFFICULTY_LABEL_PREFIX = "difficulty:"
const LOOPABLE_LABEL_PREFIX = "loopable:"
const BEADS_NUMBERED_T_ID_PATTERN = /^t-(\d{3,})$/
const BEADS_NUMBERED_GH_ID_PATTERN = /^gh-(\d+)$/

/**
 * 閉じていない状態の読み替え。表に無い状態（`blocked` など）は Beads の語のまま出す。
 * `deferred` は組み込みの保留状態、`pending` は切り替え前の独自の状態で、どちらも「保留」として出す。
 */
const TASK_STATUS_OF_BEADS_STATUS = new Map<string, string>([
  ["open", "todo"],
  ["pending", "hold"],
  ["deferred", "hold"],
  ["in_progress", "doing"],
])

function labelValueOf(labels: readonly string[], prefix: string): string | undefined {
  return labels.find((label) => label.startsWith(prefix))?.slice(prefix.length)
}

/** 番号の順に並べ、番号でない ID は後ろに ID の順で付ける。 */
function sortByTaskId<T extends { readonly id: string }>(tasks: readonly T[]): readonly T[] {
  return sortBy(tasks, [(task) => taskNumberOf(task.id), "asc"], [(task) => task.id, "asc"])
}

/** タスクIDの数字の部分（`T-` と `GH-` のどちらも）。番号でない ID は並びの最後に落とす。 */
function taskNumberOf(taskId: string): number {
  const digits = /^(?:T|GH)-(\d+)$/.exec(taskId)?.[1]
  return digits === undefined ? Number.POSITIVE_INFINITY : Number(digits)
}
