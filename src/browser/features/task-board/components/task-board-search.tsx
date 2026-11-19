// タスクのモーダルの頭の検索欄。
// 開いたときにフォーカスを受ける口で、選んでいる行を `aria-activedescendant` で指す（行に DOM のフォーカスは移さない）。

import type { KeyboardEvent, ReactElement } from "react"

import { SearchIcon } from "../../../components/ui/icon/icon.tsx"
import { Surface } from "../../../components/ui/surface/surface.tsx"
import styles from "./task-board-search.module.css"

export function TaskBoardSearch(props: {
  readonly query: string
  readonly listId: string
  /** 選んでいる行の DOM の id。行が無ければ `undefined`。 */
  readonly activeOptionId?: string
  readonly onQueryChange: (query: string) => void
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
}): ReactElement {
  return (
    <label className={styles["task-board-search-label"]}>
      <Surface
        element="div"
        tone="ground"
        space="none"
        radius="md"
        shadow="none"
        className={styles["task-board-search"]}
      >
        <SearchIcon />
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
          onKeyDown={props.onKeyDown}
        />
      </Surface>
    </label>
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
