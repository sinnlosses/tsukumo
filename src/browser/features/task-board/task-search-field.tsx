// サイドバーの探す欄。見出しの帯の下に常設する。
// 選んでいる行は `aria-activedescendant` で指し、DOM のフォーカスは欄に残す。
// 件数と「×」の枠は語が無くても確保し、頭の高さを変えない。

import { Search } from "lucide-react"
import type { KeyboardEvent, ReactElement } from "react"

import { CloseIcon } from "../../components/ui/icon/icon.tsx"
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
    <div className={styles["task-search"]}>
      <Search size={14} strokeWidth={2} aria-hidden="true" className={styles["task-search-icon"]} />
      <input
        type="search"
        role="combobox"
        className={styles["task-search-input"]}
        aria-label="タスクを探す"
        aria-expanded={true}
        aria-controls={props.listId}
        aria-activedescendant={props.activeRowDomId}
        placeholder="ID・言葉で探す"
        value={props.query}
        onChange={(event) => {
          props.onQueryChange(event.target.value)
        }}
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
    </div>
  )
}
