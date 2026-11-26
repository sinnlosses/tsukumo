// サイドバーの探す欄。見出しの帯の下に常設する。
// 選んでいる行は `aria-activedescendant` で指し、DOM のフォーカスは欄に残す。
// 件数と「×」の枠は語が無くても確保し、頭の高さを変えない。

import type { KeyboardEvent, ReactElement } from "react"

import { CloseIcon, SearchIcon } from "../../components/ui/icon/icon.tsx"
import { SearchField } from "../../components/ui/search-field/search-field.tsx"
import { Surface } from "../../components/ui/surface/surface.tsx"
import styles from "./task-search-field.module.css"

export function TaskSearchField(props: {
  readonly query: string
  readonly searching: boolean
  readonly matchCount: number
  readonly listId: string
  /** 選んでいる行の DOM の id。 */
  readonly activeRowDomId?: string
  readonly onQueryChange: (query: string) => void
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
}): ReactElement {
  return (
    <Surface
      element="div"
      tone="ground"
      space="none"
      radius="md"
      shadow="none"
      className={styles["task-search"]}
    >
      <span className={styles["task-search-icon"]}>
        <SearchIcon />
      </span>
      <SearchField
        label="タスクを探す"
        listId={props.listId}
        activeOptionId={props.activeRowDomId}
        placeholder="ID・言葉で探す"
        value={props.query}
        className={styles["task-search-input"]}
        onChange={props.onQueryChange}
        onKeyDown={props.onKeyDown}
      />
      <span className={styles["task-search-tail"]} data-visible={props.searching}>
        <span className={styles["task-search-count"]}>{`${String(props.matchCount)}件`}</span>
        <button
          type="button"
          className={styles["task-search-clear"]}
          aria-label="語を消す"
          tabIndex={props.searching ? 0 : -1}
          onMouseDown={(event) => {
            event.preventDefault()
          }}
          onClick={() => {
            props.onQueryChange("")
          }}
        >
          <CloseIcon />
        </button>
      </span>
    </Surface>
  )
}
