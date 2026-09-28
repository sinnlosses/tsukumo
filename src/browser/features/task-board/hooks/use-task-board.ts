// `<TaskBoard>`（タスクのモーダル）のロジック。
// 開いているかは呼び出し側の state で、ここはそれを `<Dialog open={...}>` へ渡す形にするのと、次の2つを持つ。
// - 表示上の状態（検索の文字・絞り込みの札・選んでいる ID・パンくず・開いている確認）。閉じると初めに戻す
// - 一覧を、行・絞り込みの札・選んだタスクの詳細・操作の帯へ畳む
// CSS の class 名はここでは決めない。

import { useCallback, useMemo, useState, type KeyboardEvent } from "react"
import { isIncludedIn } from "remeda"

import {
  taskReadiness,
  unfinishedTaskIds,
  type TaskLocation,
  type TaskSummaryItem,
  type TaskSummaryResult,
} from "../../../../shared/repository/task-summary.ts"
import { useSession } from "../../../stores/session.ts"
import type { TaskRunConfirmOutcome } from "../components/task-run-confirm.tsx"
import { taskListCounts, type TaskListCountItem } from "../domain/task-list-count.ts"
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

/** 要約の1片。`code` はバッククォートで囲まれていた部分（囲みの記号は含まない）。 */
export type SummaryPart = {
  readonly kind: "text" | "code"
  readonly text: string
}

export type TaskBoardRow = {
  readonly id: string
  /** 一覧の行の DOM の id（検索欄の `aria-activedescendant` が指す）。 */
  readonly optionId: string
  readonly summary: readonly SummaryPart[]
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
      readonly summary: readonly SummaryPart[]
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
  readonly title: readonly SummaryPart[]
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

/** 「tsukumo に頼む」。押せるのは着手できるタスクだけで、それ以外は理由を添えて押せなくする。 */
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
  | { readonly kind: "open"; readonly taskId: string }

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

/**
 * 表示上の選択の状態。`selectedId` が選んでいる行、`previousId` はパンくずの「戻る」先
 * （直前の1つだけ）、`pinnedId` は絞り込み・検索の外でも一覧に一時的に出す ID。
 * 一覧で別の行を選ぶ（`select`）とどちらも消え、つながりの札・本文の ID を押す（`jumpTo`）と
 * 両方立つ。戻る（`goBack`）は `pinnedId` だけ `previousId` に付け替える。
 */
type Navigation = {
  readonly selectedId: string | undefined
  readonly previousId: string | undefined
  readonly pinnedId: string | undefined
}

const INITIAL_NAVIGATION: Navigation = {
  selectedId: undefined,
  previousId: undefined,
  pinnedId: undefined,
}

export function useTaskBoard(
  tasks: TaskSummaryResult,
  open: boolean,
  onClose: () => void,
): TaskBoardView {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<TaskBoardFilter>("all")
  const [navigation, setNavigation] = useState<Navigation>(INITIAL_NAVIGATION)
  const [confirmingId, setConfirmingId] = useState<string | undefined>(undefined)
  // つながりの札・本文中の ID・パンくずの「戻る」はリンクやボタンを押して切り替わるので、
  // 選んだタスクの詳細が丸ごと作り直る（`key={detail.id}`）ときに押した要素ごと消え、
  // フォーカスが落ちる。変わるたびに増やし、`PresentationalTaskBoard` 側でフォーカスを
  // 器へ戻す合図にする（一覧の行を選ぶ・↑↓ だけのときはフォーカスは落ちないので増やさない）。
  const [focusSignal, setFocusSignal] = useState(0)
  const dispatch = useSession((session) => session.dispatch)
  const tracked = useTrackedFileList(open)

  // `tasks` が変わらない限り参照を保つ。本文の Markdown（`TaskBody`）の `useMemo` のキーに
  // `knownIds`・`jumpTo` を使うので、検索・絞り込みの入力のたびに参照を変えて本文を作り直させない。
  const items = useMemo(() => (tasks.kind === "known" ? tasks.items : []), [tasks])
  const entries = boardEntries(items)
  const byId = new Map(entries.map((entry) => [entry.task.id, entry]))
  const isVisible = (entry: BoardEntry): boolean =>
    matchesFilter(entry.state, filter) && matchesQuery(entry.task, query)
  const rows = entries.filter((entry) => isVisible(entry) || entry.task.id === navigation.pinnedId)
  const selected = rows.find((entry) => entry.task.id === navigation.selectedId) ?? rows[0]

  // 開いた直後・絞り込みで選んでいた行が消えたときは、一覧の先頭へ落ちる（`selected` の `?? rows[0]`）。
  // `navigation.selectedId` にも書き戻しておく。書き戻さないと、次に飛んだときのパンくずの
  // 「戻る」先（`jumpTo` が読む `prev.selectedId`）が実際に出ている行と食い違う。
  if (selected !== undefined && selected.task.id !== navigation.selectedId) {
    setNavigation((prev) => ({ ...prev, selectedId: selected.task.id }))
  }

  const knownIds = useMemo(() => new Set(items.map((item) => item.id)), [items])
  const jumpTo = useCallback(
    (id: string): void => {
      if (!items.some((item) => item.id === id)) {
        return
      }
      setNavigation((prev) => ({ selectedId: id, previousId: prev.selectedId, pinnedId: id }))
      setFocusSignal((count) => count + 1)
    },
    [items],
  )

  const close = (): void => {
    setQuery("")
    setFilter("all")
    setNavigation(INITIAL_NAVIGATION)
    setConfirmingId(undefined)
    onClose()
  }

  /** 一覧で行を直に選ぶ（クリック・↑↓）。パンくずと一時的な行は引っ込む。 */
  const select = (id: string): void => {
    setNavigation({ selectedId: id, previousId: undefined, pinnedId: undefined })
  }

  /** パンくずの「戻る」・Alt+←。戻る先が無ければ何もしない。 */
  const goBack = (): void => {
    if (navigation.previousId === undefined) {
      return
    }
    setNavigation((prev) => ({
      selectedId: prev.previousId ?? prev.selectedId,
      previousId: undefined,
      pinnedId: prev.previousId,
    }))
    setFocusSignal((count) => count + 1)
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
    openFile: (path) => {
      dispatch.host.openFile({ path })
    },
    run: setConfirmingId,
    onJump: jumpTo,
    breadcrumb:
      navigation.previousId === undefined
        ? { kind: "none" }
        : { kind: "some", previousId: navigation.previousId, onBack: goBack },
  })

  return {
    open,
    countsText: tasks.kind === "known" ? countsTextOf(taskListCounts(tasks.items)) : "",
    content,
    confirm:
      confirmingId === undefined ? { kind: "closed" } : { kind: "open", taskId: confirmingId },
    onClose: close,
    onQueryChange: setQuery,
    onFilter: setFilter,
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
    focusSignal,
  }
}

/** 一覧の1件と、その状態の言い方（行・札・件数で何度も使うので1回だけ作る）。 */
type BoardEntry = {
  readonly task: TaskSummaryItem
  readonly state: TaskStateView
}

type BoardContentInput = {
  readonly query: string
  readonly filter: TaskBoardFilter
  readonly tracked: TrackedFileList
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

/** 着手できないときに「tsukumo に頼む」の横に添える理由。 */
const RUN_UNAVAILABLE_REASON = {
  blocked: "待ちが終わると頼めます",
  hold: "保留の間は頼めません",
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
  return items.map((task) => ({ task, state: taskStateOf(task, unfinished) }))
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
  if (tasks.kind === "unknown") {
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
      summary: summaryParts(entry.task.summary),
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
      title: summaryParts(task.summary),
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
    run:
      entry.state.kind === "ready"
        ? { kind: "available", onRun: () => input.run(task.id) }
        : { kind: "unavailable", reason: RUN_UNAVAILABLE_REASON[entry.state.kind] },
  }
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
    summary: summaryParts(dependency.task.summary),
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
      summary: summaryParts(entry.task.summary),
    }))
}

/**
 * 状態の言い方。`todo` の着手できるかは `taskReadiness` の規則（一覧に無い依存は止めない）に従う。
 * 待ちと保留は、まだ済んでいない依存の ID を字で添える（色だけで伝えない）。
 */
function taskStateOf(task: TaskSummaryItem, unfinished: ReadonlySet<string>): TaskStateView {
  const readiness = taskReadiness(task, unfinished)
  if (readiness !== undefined) {
    return readiness.kind === "ready"
      ? { kind: "ready", text: "着手できる" }
      : { kind: "blocked", text: `待ち ${readiness.blockedBy.join(", ")}` }
  }

  switch (task.status) {
    case "hold": {
      const waiting = task.dependencies.filter((id) => unfinished.has(id))
      return { kind: "hold", text: waiting.length === 0 ? "保留" : `保留 · ${waiting.join(", ")}` }
    }
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

/**
 * 要約をバッククォートの囲みで割る（`code` を等幅で出すため）。
 * 囲みが閉じていない（バッククォートが奇数個）ときは割らずに字のまま出す。
 */
function summaryParts(summary: string): readonly SummaryPart[] {
  const pieces = summary.split("`")
  if (pieces.length % 2 === 0) {
    return [{ kind: "text", text: summary }]
  }
  return pieces
    .map((text, index): SummaryPart => ({ kind: index % 2 === 1 ? "code" : "text", text }))
    .filter((part) => part.text !== "")
}

function countsTextOf(counts: readonly TaskListCountItem[]): string {
  return counts.map((item) => `${item.label} ${String(item.count)}`).join(" · ")
}

function optionIdOf(taskId: string): string {
  return `task-board-option-${taskId}`
}
