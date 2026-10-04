// `<TaskBoard>`（タスクのモーダル）が画面に出す形。フックが畳み、presenter と部品が `kind` で出し分けて置く。

import type { TaskLocation } from "../../../../shared/repository/task-summary.ts"
import type { CodeSpanPart } from "../../../domain/code-span.ts"
import type { TaskRunConfirmOutcome } from "./task-run-confirm-outcome.ts"

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

/** `onKeyDown` がフックの中で読む分だけの、キー入力の形（React の `KeyboardEvent` はそのまま渡せる）。 */
export type TaskBoardKeyEvent = {
  readonly nativeEvent: { readonly isComposing: boolean }
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly key: string
  readonly preventDefault: () => void
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
  readonly onKeyDown: (event: TaskBoardKeyEvent) => void
  readonly onConfirmClose: (outcome: TaskRunConfirmOutcome) => void
  /**
   * つながりの札・本文中の ID・パンくずの「戻る」を押すたびに増える。詳細が丸ごと作り直り
   * 押した要素ごとフォーカスが落ちるので、増えるたびに中身の器へフォーカスを戻す合図にする。
   */
  readonly focusSignal: number
}
