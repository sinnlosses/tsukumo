// 一覧のタスクを、行・絞り込みの札・選んだタスクの詳細・操作の帯へ畳む。

import {
  taskReadiness,
  type TaskLocation,
  type TaskSummaryItem,
  type TaskSummaryResult,
  type TaskSummaryStatus,
} from "../../../../shared/repository/task-summary.ts"
import { codeSpanParts } from "../../../domain/code-span.ts"
import {
  choiceOf,
  tallyDraftSort,
  type DraftSortChoice,
  type DraftSortState,
} from "./draft-sort.ts"
import { FILTER_CHIPS, matchesFilter } from "./task-board-filter.ts"
import type {
  TaskBoardBreadcrumb,
  TaskBoardContent,
  TaskBoardFilter,
  TaskBoardOpener,
  TaskBoardRowSort,
  TaskBoardRun,
  TaskBoardSelection,
  TaskBoardSortBand,
  TaskDependencyCard,
  TaskStateKind,
  TaskStateView,
} from "./task-board-view.ts"
import { isTaskRequestable, type TaskRequest } from "./task-run-prompt.ts"

/** 一覧の1件と、その状態の言い方（行・札・件数で何度も使うので1回だけ作る）。 */
export type BoardEntry = {
  readonly task: TaskSummaryItem
  readonly state: TaskStateView
}

type BoardContentInput = {
  readonly query: string
  readonly filter: TaskBoardFilter
  readonly run: (taskId: string, request: TaskRequest) => void
  readonly onJump: (id: string) => void
  readonly breadcrumb: TaskBoardBreadcrumb
  readonly sort: DraftSortState
  readonly onSortChoose: (id: string, choice: DraftSortChoice) => void
  readonly onSortReason: (id: string, reason: string) => void
  readonly onSortReset: () => void
  readonly onSortRequest: (request: TaskRequest) => void
}

/** 「tsukumo に頼む」を押せないときに横に添える理由。保留は待ちが残っているときだけ押せない。 */
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

export function boardContent(
  tasks: TaskSummaryResult,
  entries: readonly BoardEntry[],
  byId: ReadonlyMap<string, BoardEntry>,
  rows: readonly BoardEntry[],
  selected: BoardEntry | undefined,
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

  return {
    kind: "known",
    listId: TASK_BOARD_LIST_ID,
    query: input.query,
    chips: FILTER_CHIPS.map((chip) => ({
      ...chip,
      count: entries.filter((entry) => matchesFilter(entry.state, chip.filter)).length,
      pressed: chip.filter === input.filter,
    })),
    rows: rows.map((entry) => ({
      id: entry.task.id,
      optionId: optionIdOf(entry.task.id),
      summary: codeSpanParts(entry.task.summary),
      state: entry.state,
      difficulty: entry.task.difficulty,
      loopable: entry.task.loopable,
      selected: entry === selected,
      outOfFilter: !isVisible(entry),
      sort: rowSortOf(entry, input),
    })),
    omittedClosedCount: tasks.omittedClosedCount,
    sortBand: sortBandOf(entries, input),
    activeOptionId: selected === undefined ? undefined : optionIdOf(selected.task.id),
    selection:
      selected === undefined ? { kind: "none" } : selectionOf(selected, entries, byId, input),
    knownIds,
  }
}

function rowSortOf(entry: BoardEntry, input: BoardContentInput): TaskBoardRowSort {
  if (input.filter !== "draft" || entry.state.kind !== "draft") {
    return { kind: "none" }
  }
  const id = entry.task.id
  return {
    kind: "some",
    choice: choiceOf(input.sort, id),
    reason: input.sort.reasons[id] ?? "",
    onChoose: (choice) => {
      input.onSortChoose(id, choice)
    },
    onReason: (reason) => {
      input.onSortReason(id, reason)
    },
  }
}

function sortBandOf(entries: readonly BoardEntry[], input: BoardContentInput): TaskBoardSortBand {
  if (input.filter !== "draft") {
    return { kind: "none" }
  }
  const draftIds = entries.filter((entry) => entry.state.kind === "draft").map((e) => e.task.id)
  const tally = tallyDraftSort(draftIds, input.sort)
  if (tally.planCount + tally.dropCount === 0) {
    return { kind: "none" }
  }
  return {
    kind: "some",
    planCount: tally.planCount,
    dropCount: tally.dropCount,
    holdCount: tally.holdCount,
    onReset: input.onSortReset,
    onRequest: () => {
      input.onSortRequest(tally.request)
    },
  }
}

function selectionOf(
  entry: BoardEntry,
  entries: readonly BoardEntry[],
  byId: ReadonlyMap<string, BoardEntry>,
  input: BoardContentInput,
): TaskBoardSelection {
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
      location: task.location,
      dependencies: task.dependencies.map((id) => dependencyCardOf(id, byId)),
      dependents: dependentsOf(task.id, entries),
      body: task.body,
    },
    breadcrumb: input.breadcrumb,
    onCopy: () => {
      // 書けなかったとき（窓にフォーカスが無いなど）は何もしない。押し直せば済む。
      void navigator.clipboard.writeText(task.id).catch(() => {})
    },
    onJump: input.onJump,
    opener: openerOf(task.location),
    run: runOf(entry, input),
  }
}

function runOf(entry: BoardEntry, input: BoardContentInput): TaskBoardRun {
  const kind = entry.state.kind
  const taskId = entry.task.id
  if (kind === "draft") {
    return {
      kind: "draft",
      onPlan: () => {
        input.run(taskId, { kind: "plan" })
      },
      onDrop: () => {
        input.run(taskId, { kind: "drop" })
      },
    }
  }
  if (kind === "ready" || isTaskRequestable(entry.task)) {
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

/**
 * 状態の言い方。`todo` の着手できるかは `taskReadiness` に従う。
 * 待ちと保留は、まだ済んでいない依存の ID を字で添える（色だけで伝えない）。
 */
function taskStateOf(task: TaskSummaryItem): TaskStateView {
  const readiness = taskReadiness(task)
  if (readiness !== undefined) {
    return readiness.kind === "ready"
      ? { kind: "ready", text: "着手できる" }
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
