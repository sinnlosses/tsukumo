// 探す（⌘K）の一覧。↑ ↓ と Ctrl+N・Ctrl+P で選ぶ行を動かし、Enter か行のクリックで選ぶ。変換中のキーは受けない。
// 行は渡された並びのまま描き、群（`group`）が前の行と変わるところに群の見出しを置く。
// 絞り込みの欄（`search`）を渡すと一覧の上に置き、キーは欄に字を打っているあいだも一覧が受ける。
// 行の絞り込みと開閉は持たない（呼び出し側が行を絞って渡す）。

import { isImeKeyEvent } from "@astryxdesign/core/utils"
import { useId, useState, type ChangeEvent, type KeyboardEvent, type ReactElement } from "react"

import styles from "./command-row.module.css"

export type CommandItem = {
  readonly key: string
  /** 群の名前。空文字の行は群の見出しを持たない。 */
  readonly group: string
  readonly label: string
  /** 行の右端に添える語（キーの名前など）。無ければ空文字。 */
  readonly hint: string
}

/** 一覧の上の絞り込みの欄。字が変わると選ぶ行を先頭へ戻す。 */
export type CommandSearch =
  | { readonly kind: "none" }
  | {
      readonly kind: "field"
      readonly ariaLabel: string
      readonly placeholder: string
      readonly value: string
      readonly onChange: (value: string) => void
    }

export type CommandListProps = {
  readonly ariaLabel: string
  readonly search: CommandSearch
  readonly items: readonly CommandItem[]
  /** 当てはまる行が無いときの一言。 */
  readonly empty: string
  readonly onSelect: (key: string) => void
}

export function CommandList(props: CommandListProps): ReactElement {
  const [active, setActive] = useState(0)
  const idPrefix = useId()
  const last = props.items.length - 1
  const activeIndex = Math.min(active, Math.max(last, 0))
  const activeId = props.items[activeIndex] === undefined ? undefined : rowId(idPrefix, activeIndex)
  const { search } = props

  const moveTo = (index: number): void => {
    setActive(index)
    document.getElementById(rowId(idPrefix, index))?.scrollIntoView({ block: "nearest" })
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (isImeKeyEvent(event.nativeEvent)) {
      return
    }
    const ctrlOnly = event.ctrlKey && !event.metaKey
    if (event.key === "ArrowDown" || (ctrlOnly && event.key === "n")) {
      event.preventDefault()
      moveTo(Math.min(activeIndex + 1, last))
    } else if (event.key === "ArrowUp" || (ctrlOnly && event.key === "p")) {
      event.preventDefault()
      moveTo(Math.max(activeIndex - 1, 0))
    } else if (event.key === "Enter") {
      event.preventDefault()
      const item = props.items[activeIndex]
      if (item !== undefined) {
        props.onSelect(item.key)
      }
    }
  }
  const onSearchChange = (event: ChangeEvent<HTMLInputElement>): void => {
    if (search.kind === "field") {
      setActive(0)
      search.onChange(event.target.value)
    }
  }

  const list = (
    <div
      id={`${idPrefix}-list`}
      role="listbox"
      tabIndex={search.kind === "none" ? 0 : -1}
      aria-label={props.ariaLabel}
      aria-activedescendant={search.kind === "none" ? activeId : undefined}
      className={styles["command-list"]}
      onKeyDown={search.kind === "none" ? onKeyDown : undefined}
    >
      {props.items.length === 0 && <p className={styles["command-empty"]}>{props.empty}</p>}
      {props.items.map((item, index) => (
        <CommandRow
          key={item.key}
          item={item}
          head={item.group !== "" && item.group !== props.items[index - 1]?.group}
          id={rowId(idPrefix, index)}
          selected={index === activeIndex}
          onSelect={props.onSelect}
          onHover={() => setActive(index)}
        />
      ))}
    </div>
  )

  if (search.kind === "none") {
    return list
  }
  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- キーは中の欄（combobox）から上がってくるものを受ける
    <div className={styles["command-search"]} onKeyDown={onKeyDown}>
      <input
        type="text"
        className={styles["command-search-field"]}
        role="combobox"
        aria-label={search.ariaLabel}
        aria-expanded={true}
        aria-controls={`${idPrefix}-list`}
        aria-activedescendant={activeId}
        placeholder={search.placeholder}
        value={search.value}
        // `autoFocus` に戻すと `<Dialog>` が開いた元を覚える前にフォーカスが入り、閉じても開いた元へ戻らなくなる
        data-autofocus="true"
        onChange={onSearchChange}
      />
      {list}
    </div>
  )
}

type CommandRowProps = {
  readonly item: CommandItem
  /** 行の前に群の見出しを置くか。 */
  readonly head: boolean
  readonly id: string
  readonly selected: boolean
  readonly onSelect: (key: string) => void
  readonly onHover: () => void
}

function CommandRow(props: CommandRowProps): ReactElement {
  const { item } = props
  return (
    <>
      {props.head && (
        <p className={styles["command-group"]} aria-hidden="true">
          {item.group}
        </p>
      )}
      {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events -- キー操作は一覧（listbox）が持つ */}
      <div
        role="option"
        id={props.id}
        aria-selected={props.selected}
        className={styles["command-row"]}
        onClick={() => props.onSelect(item.key)}
        onMouseMove={props.onHover}
      >
        <span className={styles["command-label"]}>{item.label}</span>
        {item.hint !== "" && <small className={styles["command-hint"]}>{item.hint}</small>}
      </div>
    </>
  )
}

function rowId(prefix: string, index: number): string {
  return `${prefix}-row-${String(index)}`
}
