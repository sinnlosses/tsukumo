// 一覧のタスクを、行・絞り込みのバッジ・選んだタスクの詳細・操作の帯へ畳む。

import { FRAME_ERROR_REASON } from "../../../../shared/frame-error-reason.ts"
import {
  taskReadiness,
  type TaskLocation,
  type TaskSummaryItem,
  type TaskSummaryResult,
  type TaskSummaryStatus,
} from "../../../../shared/repository/task-summary.ts"
import { codeSpanParts } from "../../../domain/code-span.ts"
import { FILTER_CHIPS, matchesFilter } from "./task-board-filter.ts"
import type {
  TaskBoardBreadcrumb,
  TaskBoardContent,
  TaskBoardFilter,
  TaskBoardOpener,
  TaskBoardRow,
  TaskBoardRun,
  TaskBoardSelection,
  TaskDependencyCard,
  TaskStage,
  TaskStateKind,
  TaskStateView,
  TaskBoardWorkRepoChip,
} from "./task-board-view.ts"
import { isTaskRequestable, type SingleTaskRequest } from "./task-run-prompt.ts"

/** 一覧の1件と、その状態の言い方（行・札・件数で何度も使うので1回だけ作る）。 */
export type BoardEntry = {
  readonly task: TaskSummaryItem
  readonly state: TaskStateView
}

/** 表の段1つ分の行。`label` は段の名前。 */
export type BoardStageGroup = {
  readonly stage: TaskStage
  readonly label: string
  readonly entries: readonly BoardEntry[]
}

/** 一覧で選ばれている行。絞り込みで行が無いときは `none`。 */
export type BoardSelected =
  | { readonly kind: "none" }
  | { readonly kind: "some"; readonly entry: BoardEntry }

/** 選んだタスクの詳細と操作の口を組むのに要る呼び先。一覧モードとサイドシートが同じ形で渡す。 */
type SelectionInput = {
  readonly run: (taskId: string, request: SingleTaskRequest) => void
  readonly onJump: (id: string) => void
  readonly onCopy: (id: string) => void
  readonly breadcrumb: TaskBoardBreadcrumb
  /** ターン進行中か。真のあいだは頼む口を押せなくする。 */
  readonly turnRunning: boolean
}

type BoardContentInput = SelectionInput & {
  readonly query: string
  readonly filter: TaskBoardFilter
  /** 絞っている作業先。無ければ全部。 */
  readonly workRepo?: string
}

/** 頼む口を押せないときに横に添える理由。保留は待ちが残っているときだけ押せない。 */
const RUN_UNAVAILABLE_REASON = {
  blocked: "待ちが終わると頼めます",
  hold: "待ちが終わると頼めます",
  doing: "着手済みです",
  done: "終わったタスクです",
  other: "状態が読めないので頼めません",
} satisfies Record<Exclude<TaskStateKind, "ready" | "draft">, string>

const TASK_BOARD_LIST_ID = "task-board-list"

/** 値が無い欄に出す文字。 */
const MISSING = "—"

export function boardEntries(items: readonly TaskSummaryItem[]): readonly BoardEntry[] {
  return items.map((task) => ({ task, state: taskStateOf(task) }))
}

/** 名指しが無いときに選ぶ行。進行中の先頭、無ければ着手可の先頭、どちらも無ければ先頭の行。 */
export function defaultBoardRow(rows: readonly BoardEntry[]): BoardSelected {
  const entry =
    rows.find((row) => row.state.kind === "doing") ??
    rows.find((row) => row.state.kind === "ready") ??
    rows[0]
  return entry === undefined ? { kind: "none" } : { kind: "some", entry }
}

/**
 * 状態の言い方。`todo` の着手できるかは `taskReadiness` に従う。
 * 待ちと保留は、まだ済んでいない依存の ID を字で添える（色だけで伝えない）。
 */
export function taskStateOf(task: TaskSummaryItem): TaskStateView {
  const readiness = taskReadiness(task)
  if (readiness !== undefined) {
    return readiness.kind === "ready"
      ? { kind: "ready", text: "着手可" }
      : { kind: "blocked", text: `待ち ${readiness.blockedBy.join(", ")}` }
  }

  if (task.status.kind !== "known") {
    return { kind: "other", text: statusTextOf(task.status) }
  }
  switch (task.status.status) {
    case "hold":
      return {
        kind: "hold",
        text: task.waitingFor.length === 0 ? "保留" : `保留 · ${task.waitingFor.join(", ")}`,
      }
    case "draft":
      return { kind: "draft", text: "ドラフト" }
    case "doing":
      return { kind: "doing", text: "進行中" }
    case "done":
      return { kind: "done", text: "完了" }
    case "todo":
      return { kind: "other", text: task.status.status }
  }
}

/** `groups` は表に出す行を段ごとに並べたもの（段の順・段の中の順のまま表に出す）。 */
export function boardContent(
  tasks: TaskSummaryResult,
  entries: readonly BoardEntry[],
  byId: ReadonlyMap<string, BoardEntry>,
  groups: readonly BoardStageGroup[],
  selected: BoardSelected,
  isVisible: (entry: BoardEntry) => boolean,
  knownIds: ReadonlySet<string>,
  input: BoardContentInput,
): TaskBoardContent {
  if (tasks.kind === "loading") {
    return { kind: "loading" }
  }
  if (tasks.kind !== "known") {
    return { kind: "unknown" }
  }
  if (entries.length === 0) {
    return { kind: "empty" }
  }

  const rowOf = (entry: BoardEntry, stage: TaskStage): TaskBoardRow => ({
    id: entry.task.id,
    optionId: optionIdOf(entry.task.id),
    stage,
    summary: codeSpanParts(entry.task.summary),
    state: entry.state,
    ...(hasWaiting(entry) ? { waiting: entry.state.text } : {}),
    difficulty: entry.task.difficulty,
    loopable: entry.task.loopable,
    ...(entry.task.workRepo === undefined ? {} : { workRepo: entry.task.workRepo }),
    selected: selected.kind === "some" && entry === selected.entry,
    outOfFilter: !isVisible(entry),
  })
  const stages = groups.map((group) => ({
    stage: group.stage,
    label: group.label,
    rows: group.entries.map((entry) => rowOf(entry, group.stage)),
  }))

  return {
    kind: "known",
    listId: TASK_BOARD_LIST_ID,
    query: input.query,
    total: entries.length,
    chips: FILTER_CHIPS.map((chip) => ({
      ...chip,
      count: entries.filter((entry) => matchesFilter(entry.state, chip.filter)).length,
      pressed: chip.filter === input.filter,
    })),
    workRepos: workRepoChipsOf(entries, input.workRepo),
    rows: stages.flatMap((stage) => stage.rows),
    stages,
    omittedClosedCount: tasks.omittedClosedCount,
    activeOptionId: selected.kind === "some" ? optionIdOf(selected.entry.task.id) : undefined,
    selection:
      selected.kind === "some"
        ? selectionOf(selected.entry, entries, byId, input)
        : { kind: "none" },
    knownIds,
  }
}

/** 選んだタスクの詳細・つながり・開く口・頼む口。`entries` はつながりの札を引く一覧の全件。 */
export function selectionOf(
  entry: BoardEntry,
  entries: readonly BoardEntry[],
  byId: ReadonlyMap<string, BoardEntry>,
  input: SelectionInput,
): Extract<TaskBoardSelection, { readonly kind: "some" }> {
  const task = entry.task
  return {
    kind: "some",
    detail: {
      id: task.id,
      status: statusTextOf(task.status),
      title: codeSpanParts(task.summary),
      state: entry.state,
      labels: task.labels,
      difficulty: task.difficulty,
      loopable: task.loopable,
      ...(task.workRepo === undefined ? {} : { workRepo: task.workRepo }),
      location: task.location,
      dependencies: task.dependencies.map((id) => dependencyCardOf(id, byId)),
      dependents: dependentsOf(task.id, entries),
      body: task.body,
    },
    breadcrumb: input.breadcrumb,
    onCopy: () => {
      input.onCopy(task.id)
    },
    onJump: input.onJump,
    opener: openerOf(task.location),
    run: runOf(entry, input),
  }
}

/** 作業先で絞る札。名前は一覧に出た順の重複なしで、件数は絞り込み・検索より前の全体。 */
function workRepoChipsOf(
  entries: readonly BoardEntry[],
  chosen?: string,
): readonly TaskBoardWorkRepoChip[] {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    const name = entry.task.workRepo
    if (name !== undefined) {
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
  }
  return [...counts].map(([name, count]) => ({ name, count, pressed: name === chosen }))
}

/** 待ちと、待ちの残る保留。状態の言い方に相手の ID が入っている。 */
function hasWaiting(entry: BoardEntry): boolean {
  return (
    entry.state.kind === "blocked" ||
    (entry.state.kind === "hold" && entry.task.waitingFor.length > 0)
  )
}

function runOf(entry: BoardEntry, input: SelectionInput): TaskBoardRun {
  const kind = entry.state.kind
  const taskId = entry.task.id
  const turnBlock = input.turnRunning ? FRAME_ERROR_REASON.taskRequestDuringTurn : undefined
  if (kind === "draft") {
    return {
      kind: "draft",
      ...(turnBlock === undefined ? {} : { blockedReason: turnBlock }),
      onPlan: () => {
        input.run(taskId, { kind: "plan" })
      },
      onDrop: () => {
        input.run(taskId, { kind: "drop" })
      },
    }
  }
  if (kind === "ready" || isTaskRequestable(entry.task)) {
    if (turnBlock !== undefined) {
      return { kind: "unavailable", reason: turnBlock }
    }
    return {
      kind: "available",
      onRun: () => {
        input.run(taskId, { kind: "start", held: kind === "hold" })
      },
    }
  }
  return { kind: "unavailable", reason: RUN_UNAVAILABLE_REASON[kind] }
}

function openerOf(location: TaskLocation): TaskBoardOpener {
  return location.kind === "issue" ? { kind: "issue", url: location.url } : { kind: "none" }
}

function dependencyCardOf(id: string, byId: ReadonlyMap<string, BoardEntry>): TaskDependencyCard {
  const dependency = byId.get(id)
  if (dependency === undefined) {
    return { kind: "unlisted", id }
  }
  return {
    kind: "listed",
    id,
    state: dependency.state,
    summary: codeSpanParts(dependency.task.summary),
  }
}

/** いまの一覧のうち、`taskId` を依存に持つものの札（並びは一覧の順のまま）。 */
function dependentsOf(
  taskId: string,
  entries: readonly BoardEntry[],
): readonly TaskDependencyCard[] {
  return entries
    .filter((entry) => entry.task.dependencies.includes(taskId))
    .map((entry) => ({
      kind: "listed" as const,
      id: entry.task.id,
      state: entry.state,
      summary: codeSpanParts(entry.task.summary),
    }))
}

function statusTextOf(status: TaskSummaryStatus): string {
  switch (status.kind) {
    case "known":
      return status.status
    case "other":
      return status.raw
    case "none":
      return MISSING
  }
}

function optionIdOf(taskId: string): string {
  return `task-board-option-${taskId}`
}
