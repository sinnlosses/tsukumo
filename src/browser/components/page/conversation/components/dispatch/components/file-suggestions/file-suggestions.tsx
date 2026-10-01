// 入力欄の `@` ファイル補完の、合図の判定と一覧を描くだけの部品。
// 候補の絞り込みは `matchingFilePaths`。
//
// キー操作（上下・Tab・Enter・Esc）と確定は呼び出し側が持つ。

import clsx from "clsx"
import type { ReactElement } from "react"

import { Text } from "../../../../../../ui/text/text.tsx"
import styles from "../../dispatch.module.css"

/**
 * いま打っている `@<パス>`。`start` から `end` までを確定後の文字列で置き換える
 * （`end` はキャレットの位置で、その後ろに書きかけの文字があっても触らない）。
 */
export type FilePathQuery = {
  /** `@` そのものの位置。 */
  readonly start: number
  /** キャレットの位置（`@` の後ろに打った分の終わり）。 */
  readonly end: number
  /** `@` の後ろに打った文字列（絞り込みに使う）。 */
  readonly term: string
}

/**
 * キャレットの直前の語が `@` 補完の合図かを見る。合図でなければ undefined。
 *
 * `@` は文中にも出るので `/` 補完の「先頭かつ空白なし」は使えない。行頭または空白の直後の
 * `@` だけを合図とみなし（`foo@example` のような語中の `@` は拾わない）、`@` からキャレットまでに
 * 空白が入ったら合図が終わったものとして扱う。
 */
export function filePathQuery(text: string, caret: number): FilePathQuery | undefined {
  const before = text.slice(0, caret)
  const start = before.lastIndexOf("@")
  if (start < 0) {
    return undefined
  }

  const preceding = start === 0 ? undefined : before[start - 1]
  if (preceding !== undefined && !/\s/.test(preceding)) {
    return undefined
  }

  const term = before.slice(start + 1)
  return /\s/.test(term) ? undefined : { start, end: caret, term }
}

export type FileSuggestionsProps = {
  readonly matches: readonly string[]
  readonly selectedIndex: number
  /** マウスで押した（`mousedown`）。既定動作（フォーカス移動）は呼び出し側で止める。 */
  readonly onSelect: (index: number) => void
}

/** `@` 補完の候補一覧。`matches` が空のときは何も出さない。 */
export function FileSuggestions(props: FileSuggestionsProps): ReactElement | null {
  if (props.matches.length === 0) {
    return null
  }

  return (
    <ul className={styles["dispatch-suggestions"]}>
      {props.matches.map((path, index) => (
        <li
          key={path}
          className={clsx(
            styles["dispatch-suggestion-item"],
            index === props.selectedIndex && styles["is-selected"],
          )}
          onMouseDown={(event) => {
            // mousedown の既定動作（フォーカス移動）を止め、textarea にフォーカスを残す。
            event.preventDefault()
            props.onSelect(index)
          }}
        >
          <Text
            element="span"
            size="inherit"
            tone="inherit"
            weight="inherit"
            className={styles["dispatch-suggestion-path"]}
          >
            {path}
          </Text>
        </li>
      ))}
    </ul>
  )
}
