// タスクのモーダルの表示上の状態（検索の文字・絞り込みの札・選んでいる行）と、その移り方。

import type { TaskBoardRequest } from "../../../stores/task-board-request.ts"
import type { TaskBoardFilter } from "../domain/task-board-view.ts"

/** 検索の文字・絞り込みの札・選んでいる行と、詳細を押して切り替えた回数。閉じると `focusSignal` 以外を初めに戻す。 */
export type BoardState = {
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
export type ShownRow = { readonly kind: "none" } | { readonly kind: "row"; readonly id: string }

type BoardAction =
  | { readonly kind: "open"; readonly request: TaskBoardRequest }
  | { readonly kind: "close" }
  | { readonly kind: "query"; readonly query: string; readonly shown: ShownRow }
  | { readonly kind: "filter"; readonly filter: TaskBoardFilter; readonly shown: ShownRow }
  | { readonly kind: "select"; readonly id: string }
  | { readonly kind: "jump"; readonly id: string; readonly shownId: string }
  | { readonly kind: "back" }

export function initialBoardState(request: TaskBoardRequest): BoardState {
  return { query: "", filter: "all", chosen: chosenOnOpen(request), focusSignal: 0 }
}

/** 選択の移り方。描画中に出ている行（`ShownRow`）は、検索・絞り込み・飛ぶときに動作が運ぶ。 */
export function boardReducer(state: BoardState, action: BoardAction): BoardState {
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

export function isChosen(chosen: ChosenRow, id: string): boolean {
  return chosen.kind !== "first" && chosen.id === id
}

/** 絞り込み・検索に当たらなくても一覧に一時的に出す行か。 */
export function isPinned(chosen: ChosenRow, id: string): boolean {
  return (
    isChosen(chosen, id) && (chosen.kind === "jumped" || (chosen.kind === "row" && chosen.pinned))
  )
}
