// `<TaskBoard>`（タスクのモーダル）が画面に出す形。フックが畳み、presenter と部品が `kind` で出し分けて置く。

import type {
  TaskDifficulty,
  TaskLocation,
  TaskLoopable,
} from "../../../../shared/repository/task-summary.ts"
import type { CodeSpanPart } from "../../../domain/code-span.ts"
import type { DraftSortChoice } from "./draft-sort.ts"
import type { TaskRunConfirmOutcome } from "./task-run-confirm-outcome.ts"
import type { TaskRunTarget } from "./task-run-prompt.ts"

/** 状態の段（サイドバーの段と一覧モードの表の段）。分け方は `stageTasks`。 */
export type TaskStage = "now" | "next" | "waiting" | "draft" | "done"

export type TaskStateKind = "ready" | "blocked" | "hold" | "draft" | "doing" | "done" | "other"

/** 状態の言い方。一覧の行・詳細の情報の表・依存の札で同じものを出す。印の形は `kind` で選ぶ。 */
export type TaskStateView = {
  readonly kind: TaskStateKind
  readonly text: string
}

export type TaskBoardRow = {
  readonly id: string
  /** 一覧の行の DOM の id（検索欄の `aria-activedescendant` が指す）。 */
  readonly optionId: string
  readonly stage: TaskStage
  readonly summary: readonly CodeSpanPart[]
  readonly state: TaskStateView
  /** 題の後ろに添える待ちの相手（待ちと、待ちの残る保留だけ）。 */
  readonly waiting?: string
  readonly difficulty?: TaskDifficulty
  readonly loopable?: TaskLoopable
  readonly workRepo?: string
  readonly selected: boolean
  /** 絞り込み・検索には当たらないが、飛んだ先として一時的に出している行なら真。 */
  readonly outOfFilter: boolean
}

/** 表の段1つ。`label` は段の名前。 */
export type TaskBoardStage = {
  readonly stage: TaskStage
  readonly label: string
  readonly rows: readonly TaskBoardRow[]
}

export type TaskBoardFilter = "all" | "ready" | "blocked" | "hold" | "draft" | "doing" | "done"

export type TaskBoardFilterChip = {
  readonly filter: TaskBoardFilter
  readonly label: string
  readonly count: number
  readonly pressed: boolean
}

/** 作業先で絞る札1枚。`pressed` は選んでいる作業先。 */
export type TaskBoardWorkRepoChip = {
  readonly name: string
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
  /** ラベル（Beads の `labels` の字のまま）。無ければ空。 */
  readonly labels: readonly string[]
  readonly difficulty?: TaskDifficulty
  readonly loopable?: TaskLoopable
  readonly workRepo?: string
  readonly location: TaskLocation
  readonly dependencies: readonly TaskDependencyCard[]
  /** いまの一覧のうち、このタスクを依存に持つもの。 */
  readonly dependents: readonly TaskDependencyCard[]
  /** 本文の Markdown（空なら空文字列）。 */
  readonly body: string
}

export type TaskBoardOpener =
  | { readonly kind: "issue"; readonly url: string }
  | { readonly kind: "none" }

/**
 * 操作の帯の頼みの口。
 * `available` は頼む口で、押せるのは着手できるタスクと、依存が済んだ保留のタスクだけ。
 * `draft` はドラフトの「計画する」「却下する」。それ以外は理由を添えて押せなくする。
 */
export type TaskBoardRun =
  | { readonly kind: "available"; readonly onRun: () => void }
  | {
      readonly kind: "draft"
      readonly onPlan: () => void
      readonly onDrop: () => void
      /** ターン進行中など、押せないときの理由。押せるなら無い。 */
      readonly blockedReason?: string
    }
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

/** 読み込み中・読めない・0件・一覧あり。0件と絞った結果の0件は出す一言が違うので分ける。 */
export type TaskBoardContent =
  | { readonly kind: "loading" }
  | { readonly kind: "unknown" }
  | { readonly kind: "empty" }
  | {
      readonly kind: "known"
      /** 一覧（`role="listbox"`）の DOM の id。検索欄の `aria-controls` が指す。 */
      readonly listId: string
      readonly query: string
      /** 一覧に載っている件数（絞り込み・検索より前の全体）。頭の題に添える。 */
      readonly total: number
      readonly chips: readonly TaskBoardFilterChip[]
      /** 作業先で絞る札。作業先の付いたタスクが1件も無ければ空（帯を出さない）。件数は絞り込み・検索より前の全体。 */
      readonly workRepos: readonly TaskBoardWorkRepoChip[]
      /** ↑↓ が動く順の行。`stages` を段の順に並べたものと同じ。 */
      readonly rows: readonly TaskBoardRow[]
      readonly stages: readonly TaskBoardStage[]
      /** 一覧に載せきれず落とした閉じたタスクの件数。0 でなければ一覧の末尾に一言を出す。 */
      readonly omittedClosedCount: number
      /** 選んでいる行の `optionId`。行が無ければ `undefined`（`aria-activedescendant` を付けない）。 */
      readonly activeOptionId?: string
      readonly selection: TaskBoardSelection
      /** いまの一覧に載っている ID（絞り込み・検索より前の全体）。本文中の ID の自動リンクが照らす先。 */
      readonly knownIds: ReadonlySet<string>
    }

/** ドラフトの分類の場面の札1枚。 */
export type DraftSortCard = {
  readonly id: string
  readonly state: TaskStateView
  readonly difficulty?: TaskDifficulty
  readonly summary: readonly CodeSpanPart[]
  /** 本文の頭。見出しと空行を除いた先頭の数行を1行に畳んだもの。無ければ空。 */
  readonly bodyHead: string
  readonly choice: DraftSortChoice
  /** 却下の理由（1行）。却下でない札でも持つ。 */
  readonly reason: string
}

/** ドラフトの分類の場面の中身（札と下端の口）。 */
export type DraftSortPanelView = {
  readonly cards: readonly DraftSortCard[]
  /** 下端の口。計画か却下を1件以上選んだときだけ `some`。 */
  readonly band:
    | { readonly kind: "none"; readonly laterCount: number }
    | {
        readonly kind: "some"
        readonly planCount: number
        readonly dropCount: number
        readonly laterCount: number
        readonly onReset: () => void
        readonly onRequest: () => void
        /** ターン進行中など、頼む口を押せないときの理由。押せるなら無い。 */
        readonly blockedReason?: string
      }
  readonly onChoose: (id: string, choice: DraftSortChoice) => void
  readonly onReason: (id: string, reason: string) => void
}

/**
 * 件数の帯の右端の「仕分ける」と、右の欄に出すドラフトの分類の場面。
 * ドラフトが1件も無ければ `none`。`open` のあいだは右の欄が詳細の代わりに分類の場面になる。
 */
export type TaskBoardDraftSort =
  | { readonly kind: "none" }
  | { readonly kind: "closed"; readonly onToggle: () => void }
  | {
      readonly kind: "open"
      readonly onToggle: () => void
      readonly panel: DraftSortPanelView
      /** 分類の場面の「×」。閉じてフォーカスを「仕分ける」の口へ戻す。 */
      readonly onClose: () => void
      /** 分類の場面の中で打った ↑↓ を、一覧の選択を動かす器へ伝えない。 */
      readonly onPaneKeyDown: (event: { readonly stopPropagation: () => void }) => void
    }

type TaskBoardConfirm =
  | { readonly kind: "closed" }
  | { readonly kind: "open"; readonly target: TaskRunTarget }

/** `onKeyDown` がフックの中で読む分だけの、キー入力の形（React の `KeyboardEvent` はそのまま渡せる）。 */
type TaskBoardKeyEvent = {
  readonly nativeEvent: { readonly isComposing: boolean }
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly key: string
  readonly preventDefault: () => void
}

export type TaskBoardView = {
  readonly open: boolean
  readonly content: TaskBoardContent
  readonly draftSort: TaskBoardDraftSort
  readonly confirm: TaskBoardConfirm
  readonly onClose: () => void
  readonly onQueryChange: (query: string) => void
  readonly onFilter: (filter: TaskBoardFilter) => void
  /** 作業先で絞る。`undefined` は全部に戻す。 */
  readonly onWorkRepo: (workRepo?: string) => void
  readonly onSelect: (id: string) => void
  /** モーダルの中身の器で受けるキー（↑↓ で行を移る。Alt+← は「戻る」。Esc は `<dialog>` が閉じる）。 */
  readonly onKeyDown: (event: TaskBoardKeyEvent) => void
  /**
   * 検索欄だけで受けるキー（Enter で選んでいる行の頼む口の確認を開く）。
   * 器の `onKeyDown` で受けると、閉じるボタンや件数の帯のボタンの Enter も拾う。
   */
  readonly onSearchKeyDown: (event: TaskBoardKeyEvent) => void
  readonly onConfirmClose: (outcome: TaskRunConfirmOutcome) => void
  /**
   * つながりの札・本文中の ID・パンくずの「戻る」を押すたびに増える。詳細が丸ごと作り直り
   * 押した要素ごとフォーカスが落ちるので、増えるたびに中身の器へフォーカスを戻す合図にする。
   */
  readonly focusSignal: number
}
