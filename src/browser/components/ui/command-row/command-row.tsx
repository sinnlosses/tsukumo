// 探す（⌘K）の一覧。↑ ↓ で選ぶ行を動かし、Enter か行のクリックで選ぶ。
// 絞り込みの入力欄と開閉は持たない（呼び出し側が行を絞って渡す）。

import { useState, type KeyboardEvent, type ReactElement } from "react"

import styles from "./command-row.module.css"

export type CommandItem = {
  readonly key: string
  readonly label: string
  /** 行の右端に添える語（キーの名前など）。無ければ空文字。 */
  readonly hint: string
}

export type CommandListProps = {
  readonly ariaLabel: string
  readonly items: readonly CommandItem[]
  readonly onSelect: (key: string) => void
}

export function CommandList(props: CommandListProps): ReactElement {
  const [active, setActive] = useState(0)
  const last = props.items.length - 1
  const activeIndex = Math.min(active, Math.max(last, 0))

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActive(Math.min(activeIndex + 1, last))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActive(Math.max(activeIndex - 1, 0))
    } else if (event.key === "Enter") {
      event.preventDefault()
      const item = props.items[activeIndex]
      if (item !== undefined) {
        props.onSelect(item.key)
      }
    }
  }

  return (
    <div
      role="listbox"
      tabIndex={0}
      aria-label={props.ariaLabel}
      aria-activedescendant={
        props.items[activeIndex] === undefined ? undefined : rowId(activeIndex)
      }
      className={styles["command-list"]}
      onKeyDown={onKeyDown}
    >
      {props.items.map((item, index) => (
        // oxlint-disable-next-line jsx-a11y/click-events-have-key-events -- キー操作は一覧（listbox）が持つ
        <div
          key={item.key}
          role="option"
          id={rowId(index)}
          aria-selected={index === activeIndex}
          className={styles["command-row"]}
          onClick={() => props.onSelect(item.key)}
          onMouseMove={() => setActive(index)}
        >
          <span className={styles["command-label"]}>{item.label}</span>
          {item.hint !== "" && <small className={styles["command-hint"]}>{item.hint}</small>}
        </div>
      ))}
    </div>
  )
}

function rowId(index: number): string {
  return `command-row-${String(index)}`
}
