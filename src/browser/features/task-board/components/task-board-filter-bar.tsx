// タスクのモーダルの左上。検索欄と、状態で絞る札（件数つき）。
// 検索欄は開いたときにフォーカスを受ける口で、選んでいる行を `aria-activedescendant` で指す（行に DOM のフォーカスは移さない）。

import { Search } from "lucide-react"
import type { ReactElement } from "react"

import type { TaskBoardFilter, TaskBoardFilterChip } from "../domain/task-board-view.ts"
import styles from "./task-board-filter-bar.module.css"

export function TaskBoardFilterBar(props: {
  readonly query: string
  readonly chips: readonly TaskBoardFilterChip[]
  readonly listId: string
  /** 選んでいる行の DOM の id。行が無ければ `undefined`。 */
  readonly activeOptionId: string | undefined
  readonly onQueryChange: (query: string) => void
  readonly onFilter: (filter: TaskBoardFilter) => void
}): ReactElement {
  return (
    <div className={styles["task-board-filter"]}>
      <div className={styles["task-board-search"]}>
        <Search size={16} strokeWidth={2} aria-hidden="true" />
        <input
          type="search"
          className={styles["task-board-search-input"]}
          aria-label="タスクを探す"
          placeholder="ID・言葉で探す"
          value={props.query}
          role="combobox"
          aria-expanded={true}
          aria-controls={props.listId}
          aria-activedescendant={props.activeOptionId}
          ref={markAutofocus}
          onChange={(event) => props.onQueryChange(event.target.value)}
        />
      </div>
      <div role="group" aria-label="状態で絞る" className={styles["task-board-chips"]}>
        {props.chips.map((chip) => (
          <button
            key={chip.filter}
            type="button"
            className={styles["task-board-chip"]}
            aria-pressed={chip.pressed}
            onClick={() => props.onFilter(chip.filter)}
          >
            {chip.label}{" "}
            <span className={styles["task-board-chip-count"]}>{String(chip.count)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * 開いたときのフォーカスを検索欄に置くため、`autofocus` の属性を書く。
 * `showModal()` は `autofocus` の属性を持つ子へフォーカスを置き、無ければ最初のフォーカスできる子（↑↓ を受ける器）へ置く。
 * React の `autoFocus` は属性を書かずに描いた瞬間に `focus()` するだけで、そのあとに走る `showModal()` に上書きされる。
 */
function markAutofocus(element: HTMLInputElement | null): void {
  element?.setAttribute("autofocus", "")
}
