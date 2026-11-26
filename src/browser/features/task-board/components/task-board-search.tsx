// タスクのモーダルの頭の検索欄。
// 開いたときにフォーカスを受ける口で、選んでいる行を `aria-activedescendant` で指す（行に DOM のフォーカスは移さない）。

import type { KeyboardEvent, ReactElement } from "react"

import { SearchIcon } from "../../../components/ui/icon/icon.tsx"
import { SearchField } from "../../../components/ui/search-field/search-field.tsx"
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
        <SearchField
          label="タスクを探す"
          placeholder="ID・言葉で探す"
          value={props.query}
          listId={props.listId}
          activeOptionId={props.activeOptionId}
          className={styles["task-board-search-input"]}
          hasAutoFocus
          onChange={props.onQueryChange}
          onKeyDown={props.onKeyDown}
        />
      </Surface>
    </label>
  )
}
