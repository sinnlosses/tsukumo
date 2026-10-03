// `<TaskBoard>`（タスクのモーダル）のロジック。
// 開いているか（と、開いたときに選ぶ行）は呼び出し側の `TaskBoardRequest` で、ここはそれを `<Dialog open={...}>` へ渡す形にするのと、次の2つを持つ。
// - 表示上の状態（検索の文字・絞り込みの札・選んでいる ID・パンくず・開いている確認）。閉じると初めに戻す
// - 一覧を、行・絞り込みの札・選んだタスクの詳細・操作の帯へ畳む
// CSS の class 名はここでは決めない。

import { useReducer, useState, type KeyboardEvent } from "react"
import { isIncludedIn } from "remeda"

import { DEFAULT_RUN_PROMPT } from "../../../../shared/repository/project-settings.ts"
import {
  taskReadiness,
  unfinishedTaskIds,
  type TaskLocation,
  type TaskSummaryItem,
  type TaskSummaryResult,
} from "../../../../shared/repository/task-summary.ts"
import { type CodeSpanPart, codeSpanParts } from "../../../domain/code-span.ts"
import { useSession } from "../../../stores/session.ts"
import type { TaskBoardRequest } from "../../../stores/task-board-request.ts"
import type { TaskRunConfirmOutcome } from "../components/task-run-confirm.tsx"
import type { RunDestination } from "../domain/run-destination.ts"
import { taskListCounts, type TaskListCountItem } from "../domain/task-list-count.ts"
import { useRunDestination } from "./use-run-destination.ts"
import { useTrackedFileList, type TrackedFileList } from "./use-tracked-file-list.ts"

export type TaskStateKind = "ready" | "blocked" | "hold" | "doing" | "done" | "dropped" | "other"

/** 状態の言い方。一覧の行・詳細の情報の表・依存の札で同じものを出す。印の形は `kind` で選ぶ。 */
export type TaskStateView = {
  readonly kind: TaskStateKind
  readonly text: string
}

/** 難易度。`level` は塗る点の数（haiku 1・sonnet 2・opus 3）で、読めない値・無いときは 0。 */
export type TaskDifficultyView = {
  readonly level: 0 | 1 | 2 | 3
  readonly text: string
}

export type TaskBoardRow = {
  readonly id: string
  /** 一覧の行の DOM の id（検索欄の `aria-activedescendant` が指す）。 */
  readonly optionId: string
  readonly summary: readonly CodeSpanPart[]
  readonly state: TaskStateView
  /** `loopable` が `Y` のときだけ真（印を出す）。 */
  readonly loopable: boolean
  readonly difficulty: TaskDifficultyView
  readonly selected: boolean
  /** 絞り込み・検索には当たらないが、飛んだ先として一時的に出している行なら真。 */
  readonly outOfFilter: boolean
}

export type TaskBoardFilter = "all" | "ready" | "blocked" | "hold" | "doing" | "done"

export type TaskBoardFilterChip = {
  readonly filter: TaskBoardFilter
  readonly label: string
  readonly count: number
  readonly pressed: boolean
}

/** つながりの札1枚（「先に終わっていてほしいもの」「これを待っているもの」）。一覧に無い依存は ID だけ。 */
export type TaskDependencyCard =
  | {
      readonly kind: "listed"
      readonly id: string
      readonly state: TaskStateView
      readonly summary: readonly CodeSpanPart[]
    }
  | { readonly kind: "unlisted"; readonly id: string }

/** パンくず。直前の1つだけを持つ（履歴を積まない）。一覧で別の行を選ぶと `none` に戻る。 */
export type TaskBoardBreadcrumb =
  | { readonly kind: "none" }
  | { readonly kind: "some"; readonly previousId: string; readonly onBack: () => void }

export type TaskBoardDetail = {
  readonly id: string
  /** status の生の値。無ければ「—」。 */
  readonly status: string
  readonly title: readonly CodeSpanPart[]
  readonly state: TaskStateView
  readonly difficulty: TaskDifficultyView
  /** `on` は `loopable` が `Y` のとき（印を添える）。 */
  readonly loop: { readonly on: boolean; readonly text: string }
  readonly location: TaskLocation
  readonly dependencies: readonly TaskDependencyCard[]
  /** いまの一覧のうち、このタスクを依存に持つもの。 */
  readonly dependents: readonly TaskDependencyCard[]
  /** 本文の Markdown（空なら空文字列）。 */
  readonly body: string
}

/** 置き場所を開く口。ファイル方式は作業ツリーの git 管理下にあるときだけ押せる。 */
export type TaskBoardOpener =
  | {
      readonly kind: "file"
      readonly availability: "checking" | "tracked" | "untracked"
      readonly onOpen: () => void
    }
  | { readonly kind: "issue"; readonly url: string }
  | { readonly kind: "none" }

/** 「tsukumo に頼む」。押せるのは着手できるタスクと、依存が済んだ保留のタスクだけで、それ以外は理由を添えて押せなくする。 */
export type TaskBoardRun =
  | { readonly kind: "available"; readonly onRun: () => void }
  | { readonly kind: "unavailable"; readonly reason: string }

export type TaskBoardSelection =
  | { readonly kind: "none" }
  | {
      readonly kind: "some"
      readonly detail: TaskBoardDetail
      readonly breadcrumb: TaskBoardBreadcrumb
      readonly onCopy: () => void
      /** 依存・依存元の札、本文中の ID を押したときに呼ぶ（一覧に無い ID では呼ばれない）。 */
      readonly onJump: (id: string) => void
      readonly opener: TaskBoardOpener
      readonly run: TaskBoardRun
    }

/** 読めない・0件・一覧あり。0件と絞った結果の0件は出す一言が違うので分ける。 */
export type TaskBoardContent =
  | { readonly kind: "unknown" }
  | { readonly kind: "empty" }
  | {
      readonly kind: "known"
      /** 一覧（`role="listbox"`）の DOM の id。検索欄の `aria-controls` が指す。 */
      readonly listId: string
      readonly query: string
      readonly chips: readonly TaskBoardFilterChip[]
      readonly rows: readonly TaskBoardRow[]
      /** 選んでいる行の `optionId`。行が無ければ `undefined`（`aria-activedescendant` を付けない）。 */
      readonly activeOptionId: string | undefined
      readonly selection: TaskBoardSelection
      /** いまの一覧に載っている ID（絞り込み・検索より前の全体）。本文中の ID の自動リンクが照らす先。 */
      readonly knownIds: ReadonlySet<string>
    }

export type TaskBoardConfirm =
  | { readonly kind: "closed" }
  | {
      readonly kind: "open"
      readonly taskId: string
      readonly held: boolean
      readonly runPrompt: string
    }

export type TaskBoardView = {
  readonly open: boolean
  /** 見出しの帯の件数（「進行中 2 · 未着手 19 · 完了 0」）。読めないときは空文字列。 */
  readonly countsText: string
  readonly content: TaskBoardContent
  readonly confirm: TaskBoardConfirm
  readonly onClose: () => void
  readonly onQueryChange: (query: string) => void
  readonly onFilter: (filter: TaskBoardFilter) => void
  readonly onSelect: (id: string) => void
  /** モーダルの中身の器で受けるキー（↑↓ で行を移る。Alt+← は「戻る」。Esc は `<dialog>` が閉じる）。 */
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  readonly onConfirmClose: (outcome: TaskRunConfirmOutcome) => void
  /**
   * つながりの札・本文中の ID・パンくずの「戻る」を押すたびに増える。詳細が丸ごと作り直り
   * 押した要素ごとフォーカスが落ちるので、増えるたびに中身の器へフォーカスを戻す合図にする。
   */
  readonly focusSignal: number
}

/** 検索の文字・絞り込みの札・選んでいる行と、詳細を押して切り替えた回数。閉じると `focusSignal` 以外を初めに戻す。 */
type BoardState = {
  readonly query: string
  readonly filter: TaskBoardFilter
  readonly chosen: ChosenRow
  /**
   * つながりの札・本文中の ID・パンくずの「戻る」で切り替えるたびに増える。押した要素は
   * 詳細が丸ごと作り直る（`key={detail.id}`）ときに消えてフォーカスが落ちるので、
   * `PresentationalTaskBoard` 側でフォーカスを器へ戻す合図にする
   * （一覧の行を選ぶ・↑↓ だけのときはフォーカスは落ちないので増やさない）。
   */
  readonly focusSignal: number
}

/**
 * 選んでいる行。
 * - `first`: まだ行を決めていない。一覧の先頭を出す
 * - `row`: 一覧で選んだ・タスクを指して開いた・パンくずで戻った行。`pinned` なら絞り込み・検索の外でも一覧に一時的に出す
 * - `jumped`: つながりの札・本文の ID で飛んだ先。一覧に一時的に出し、`previousId` がパンくずの「戻る」先（直前の1つだけ）
 */
type ChosenRow =
  | { readonly kind: "first" }
  | { readonly kind: "row"; readonly id: string; readonly pinned: boolean }
  | { readonly kind: "jumped"; readonly id: string; readonly previousId: string }

/** 選択の移り方に渡す、いま一覧で選ばれて出ている行（行が0件なら `none`）。 */
type ShownRow = { readonly kind: "none" } | { readonly kind: "row"; readonly id: string }

type BoardAction =
  | { readonly kind: "open"; readonly request: TaskBoardRequest }
  | { readonly kind: "close" }
  | { readonly kind: "query"; readonly query: string; readonly shown: ShownRow }
  | { readonly kind: "filter"; readonly filter: TaskBoardFilter; readonly shown: ShownRow }
  | { readonly kind: "select"; readonly id: string }
  | { readonly kind: "jump"; readonly id: string; readonly shownId: string }
  | { readonly kind: "back" }

export function useTaskBoard(
  tasks: TaskSummaryResult,
  request: TaskBoardRequest,
  onClose: () => void,
): TaskBoardView {
  const open = request.kind === "open"
  const [state, send] = useReducer(boardReducer, request, initialBoardState)
  const [requestShown, setRequestShown] = useState(request)
  if (request !== requestShown) {
    setRequestShown(request)
    send({ kind: "open", request })
  }
  const [confirmingId, setConfirmingId] = useState<string | undefined>(undefined)
  const dispatch = useSession((session) => session.dispatch)
  const tracked = useTrackedFileList(open)
  const runPrompt = tasks.kind === "known" ? tasks.runPrompt : DEFAULT_RUN_PROMPT
  const destination = useRunDestination(runPrompt)

  const { query, filter, chosen } = state
  const items = tasks.kind === "known" ? tasks.items : []
  const entries = boardEntries(items)
  const byId = new Map(entries.map((entry) => [entry.task.id, entry]))
  const isVisible = (entry: BoardEntry): boolean =>
    matchesFilter(entry.state, filter) && matchesQuery(entry.task, query)
  const rows = entries.filter((entry) => isVisible(entry) || isPinned(chosen, entry.task.id))
  // 選んでいた行が絞り込み・検索で消えたときも、一覧の先頭へ落ちる。
  const selected = rows.find((entry) => isChosen(chosen, entry.task.id)) ?? rows[0]
  const shown: ShownRow =
    selected === undefined ? { kind: "none" } : { kind: "row", id: selected.task.id }

  const knownIds = new Set(items.map((item) => item.id))
  const jumpTo = (id: string): void => {
    if (selected === undefined || !knownIds.has(id)) {
      return
    }
    send({ kind: "jump", id, shownId: selected.task.id })
  }

  const close = (): void => {
    send({ kind: "close" })
    setConfirmingId(undefined)
    onClose()
  }

  /** 一覧で行を直に選ぶ（クリック・↑↓）。パンくずと一時的な行は引っ込む。 */
  const select = (id: string): void => {
    send({ kind: "select", id })
  }

  /** パンくずの「戻る」・Alt+←。戻る先が無ければ何もしない。 */
  const goBack = (): void => {
    send({ kind: "back" })
  }

  const move = (step: number): void => {
    const index = rows.findIndex((entry) => entry === selected)
    const next = rows[Math.min(Math.max(index + step, 0), rows.length - 1)]
    if (next !== undefined) {
      select(next.task.id)
    }
  }

  const content = boardContent(tasks, entries, byId, rows, selected, isVisible, knownIds, {
    query,
    filter,
    tracked,
    destination,
    openFile: (path) => {
      dispatch.host.openFile({ path })
    },
    run: setConfirmingId,
    onJump: jumpTo,
    breadcrumb:
      chosen.kind === "jumped"
        ? { kind: "some", previousId: chosen.previousId, onBack: goBack }
        : { kind: "none" },
  })

  return {
    open,
    countsText: tasks.kind === "known" ? countsTextOf(taskListCounts(tasks.items)) : "",
    content,
    confirm:
      confirmingId === undefined
        ? { kind: "closed" }
        : {
            kind: "open",
            taskId: confirmingId,
            held: byId.get(confirmingId)?.state.kind === "hold",
            runPrompt,
          },
    onClose: close,
    onQueryChange: (nextQuery) => {
      send({ kind: "query", query: nextQuery, shown })
    },
    onFilter: (nextFilter) => {
      send({ kind: "filter", filter: nextFilter, shown })
    },
    onSelect: select,
    onKeyDown: (event) => {
      if (event.nativeEvent.isComposing || event.metaKey || event.ctrlKey) {
        return
      }
      if (event.altKey) {
        if (event.key === "ArrowLeft") {
          event.preventDefault()
          goBack()
        }
        return
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        move(event.key === "ArrowDown" ? 1 : -1)
      }
    },
    onConfirmClose: (outcome) => {
      setConfirmingId(undefined)
      if (outcome === "sent") {
        close()
      }
    },
    focusSignal: state.focusSignal,
  }
}

function initialBoardState(request: TaskBoardRequest): BoardState {
  return { query: "", filter: "all", chosen: chosenOnOpen(request), focusSignal: 0 }
}

/** 選択の移り方。描画中に出ている行（`ShownRow`）は、検索・絞り込み・飛ぶときに動作が運ぶ。 */
function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.kind) {
    case "open":
      return { ...state, chosen: chosenOnOpen(action.request) }
    case "close":
      return { query: "", filter: "all", chosen: { kind: "first" }, focusSignal: state.focusSignal }
    case "query":
      return { ...state, query: action.query, chosen: settledOn(state.chosen, action.shown) }
    case "filter":
      return { ...state, filter: action.filter, chosen: settledOn(state.chosen, action.shown) }
    case "select":
      return { ...state, chosen: { kind: "row", id: action.id, pinned: false } }
    case "jump":
      return {
        ...state,
        chosen: { kind: "jumped", id: action.id, previousId: action.shownId },
        focusSignal: state.focusSignal + 1,
      }
    case "back":
      if (state.chosen.kind !== "jumped") {
        return state
      }
      return {
        ...state,
        chosen: { kind: "row", id: state.chosen.previousId, pinned: true },
        focusSignal: state.focusSignal + 1,
      }
  }
}

/** 開くよう頼まれたときの選択。タスクを選んで開くなら、絞り込み・検索の外でも一覧にその行を出す。 */
function chosenOnOpen(request: TaskBoardRequest): ChosenRow {
  return request.kind === "open" && request.focus.kind === "task"
    ? { kind: "row", id: request.focus.id, pinned: true }
    : { kind: "first" }
}

/**
 * 一覧を絞り直す前に、選択を出ている行へ寄せる。選んでいた行が消えて先頭へ落ちていたなら、
 * 絞り込みを緩めても元の行へは戻らず先頭の行のまま。行が0件のあいだは元の選択を持ち続ける。
 */
function settledOn(chosen: ChosenRow, shown: ShownRow): ChosenRow {
  if (shown.kind === "none" || isChosen(chosen, shown.id)) {
    return chosen
  }
  return { kind: "row", id: shown.id, pinned: false }
}

function isChosen(chosen: ChosenRow, id: string): boolean {
  return chosen.kind !== "first" && chosen.id === id
}

/** 絞り込み・検索に当たらなくても一覧に一時的に出す行か。 */
function isPinned(chosen: ChosenRow, id: string): boolean {
  return (
    isChosen(chosen, id) && (chosen.kind === "jumped" || (chosen.kind === "row" && chosen.pinned))
  )
}

/** 一覧の1件と、その状態の言い方（行・札・件数で何度も使うので1回だけ作る）。 */
type BoardEntry = {
  readonly task: TaskSummaryItem
  readonly state: TaskStateView
  /** 依存のうち、まだ済んでいない（一覧にあって完了・取り下げでない）ものの ID。 */
  readonly waiting: readonly string[]
}

type BoardContentInput = {
  readonly query: string
  readonly filter: TaskBoardFilter
  readonly tracked: TrackedFileList
  readonly destination: RunDestination
  readonly openFile: (path: string) => void
  readonly run: (taskId: string) => void
  readonly onJump: (id: string) => void
  readonly breadcrumb: TaskBoardBreadcrumb
}

const FILTER_CHIPS = [
  { filter: "all", label: "すべて" },
  { filter: "ready", label: "着手できる" },
  { filter: "blocked", label: "待ち" },
  { filter: "hold", label: "保留" },
  { filter: "doing", label: "進行中" },
  { filter: "done", label: "完了" },
] satisfies readonly { readonly filter: TaskBoardFilter; readonly label: string }[]

/** 「tsukumo に頼む」を押せないときに横に添える理由。保留は待ちが残っているときだけ押せない。 */
const RUN_UNAVAILABLE_REASON = {
  blocked: "待ちが終わると頼めます",
  hold: "待ちが終わると頼めます",
  doing: "着手済みです",
  done: "終わったタスクです",
  dropped: "終わったタスクです",
  other: "状態が読めないので頼めません",
} satisfies Record<Exclude<TaskStateKind, "ready">, string>

const DIFFICULTIES = ["haiku", "sonnet", "opus"] as const

const DIFFICULTY_LEVEL = {
  haiku: 1,
  sonnet: 2,
  opus: 3,
} satisfies Record<(typeof DIFFICULTIES)[number], TaskDifficultyView["level"]>

const TASK_BOARD_LIST_ID = "task-board-list"

/** 値が無い欄に出す文字。 */
const MISSING = "—"

function boardEntries(items: readonly TaskSummaryItem[]): readonly BoardEntry[] {
  const unfinished = unfinishedTaskIds(items)
  return items.map((task) => {
    const waiting = task.dependencies.filter((id) => unfinished.has(id))
    return { task, state: taskStateOf(task, unfinished, waiting), waiting }
  })
}

function boardContent(
  tasks: TaskSummaryResult,
  entries: readonly BoardEntry[],
  byId: ReadonlyMap<string, BoardEntry>,
  rows: readonly BoardEntry[],
  selected: BoardEntry | undefined,
  isVisible: (entry: BoardEntry) => boolean,
  knownIds: ReadonlySet<string>,
  input: BoardContentInput,
): TaskBoardContent {
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
      loopable: entry.task.loopable === "Y",
      difficulty: difficultyOf(entry.task.difficulty),
      selected: entry === selected,
      outOfFilter: !isVisible(entry),
    })),
    activeOptionId: selected === undefined ? undefined : optionIdOf(selected.task.id),
    selection:
      selected === undefined ? { kind: "none" } : selectionOf(selected, entries, byId, input),
    knownIds,
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
      status: task.status ?? MISSING,
      title: codeSpanParts(task.summary),
      state: entry.state,
      difficulty: difficultyOf(task.difficulty),
      loop: loopOf(task.loopable),
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
    opener: openerOf(task.location, input),
    run: runOf(entry, input),
  }
}

/** 保留のタスクは、送った先の `/next-task` が着手の前に判断を利用者に尋ねるので頼める。 */
function runOf(entry: BoardEntry, input: BoardContentInput): TaskBoardRun {
  const kind = entry.state.kind
  if (kind === "ready" || (kind === "hold" && entry.waiting.length === 0)) {
    return input.destination.kind === "missing"
      ? { kind: "unavailable", reason: `/${input.destination.command} が無いので頼めません` }
      : { kind: "available", onRun: () => input.run(entry.task.id) }
  }
  return { kind: "unavailable", reason: RUN_UNAVAILABLE_REASON[kind] }
}

function openerOf(location: TaskLocation, input: BoardContentInput): TaskBoardOpener {
  if (location.kind === "issue") {
    return { kind: "issue", url: location.url }
  }
  if (location.kind === "none") {
    return { kind: "none" }
  }

  const availability =
    input.tracked.kind === "checking"
      ? "checking"
      : input.tracked.files.has(location.path)
        ? "tracked"
        : "untracked"
  return { kind: "file", availability, onOpen: () => input.openFile(location.path) }
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
 * 状態の言い方。`todo` の着手できるかは `taskReadiness` の規則（一覧に無い依存は止めない）に従う。
 * 待ちと保留は、まだ済んでいない依存の ID を字で添える（色だけで伝えない）。
 */
function taskStateOf(
  task: TaskSummaryItem,
  unfinished: ReadonlySet<string>,
  waiting: readonly string[],
): TaskStateView {
  const readiness = taskReadiness(task, unfinished)
  if (readiness !== undefined) {
    return readiness.kind === "ready"
      ? { kind: "ready", text: "着手できる" }
      : { kind: "blocked", text: `待ち ${readiness.blockedBy.join(", ")}` }
  }

  switch (task.status) {
    case "hold":
      return { kind: "hold", text: waiting.length === 0 ? "保留" : `保留 · ${waiting.join(", ")}` }
    case "doing":
      return {
        kind: "doing",
        text: task.assignee === undefined ? "進行中" : `進行中（${task.assignee}）`,
      }
    case "done":
      return { kind: "done", text: "完了" }
    case "dropped":
      return { kind: "dropped", text: "取り下げ" }
    default:
      return { kind: "other", text: task.status ?? MISSING }
  }
}

/** 札の絞り込み。`dropped` と想定外の値はどの札にも属さず、「すべて」でだけ出る。 */
function matchesFilter(state: TaskStateView, filter: TaskBoardFilter): boolean {
  return filter === "all" || filter === state.kind
}

/** 検索。ID・要約・本文の部分一致で、大文字小文字を区別しない。ID の形は決め打ちしない。 */
function matchesQuery(task: TaskSummaryItem, query: string): boolean {
  const needle = query.trim().toLowerCase()
  return (
    needle === "" ||
    task.id.toLowerCase().includes(needle) ||
    task.summary.toLowerCase().includes(needle) ||
    task.body.toLowerCase().includes(needle)
  )
}

function difficultyOf(difficulty: string | undefined): TaskDifficultyView {
  if (difficulty === undefined) {
    return { level: 0, text: MISSING }
  }
  return {
    level: isIncludedIn(difficulty, DIFFICULTIES) ? DIFFICULTY_LEVEL[difficulty] : 0,
    text: difficulty,
  }
}

function loopOf(loopable: string | undefined): TaskBoardDetail["loop"] {
  if (loopable === "Y") {
    return { on: true, text: "回せる" }
  }
  if (loopable === "N") {
    return { on: false, text: "回さない" }
  }
  return { on: false, text: loopable ?? MISSING }
}

function countsTextOf(counts: readonly TaskListCountItem[]): string {
  return counts.map((item) => `${item.label} ${String(item.count)}`).join(" · ")
}

function optionIdOf(taskId: string): string {
  return `task-board-option-${taskId}`
}
