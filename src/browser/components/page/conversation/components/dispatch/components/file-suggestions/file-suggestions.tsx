// 入力欄の `@` ファイル補完の**絞り方と一覧**（`/` 補完の `command-suggestions.tsx` と対）。
// **キャレットの直前の語が「行頭または空白の直後の `@`」で始まり、まだ空白を含まないときだけ**
// 候補を出す（docs/display.md 4.2「入力欄」）。
//
// **候補の元を取るのは `conversation/components/hooks/use-repository-file-paths.ts`**（git 管理下のパス。外の世界に
// 触るのはあちらだけ）。ここは純粋な絞り込みと、一覧を描くだけの部品を持つ。
//
// **絞り方は `/` 補完と同じ**（前方一致を先に、続けて部分一致。各グループの中は辞書順で、合計
// 最大 {@link MAX_FILE_SUGGESTIONS} 件）。違うのは**大文字小文字を区別しない**ことだけで、
// 打った綴りのまま `README.md` のようなパスに当てられるようにしてある。
//
// キー操作（上下・Tab・Enter・Esc）と確定は呼び出し側（`hooks/use-composer.ts`）が持つ（`/` 補完と同じ）。

import { type ReactElement } from "react"
import { identity, sortBy } from "remeda"

import styles from "../../dispatch.module.css"

export const MAX_FILE_SUGGESTIONS = 10

/**
 * いま打っている `@<パス>`。**`start` から `end` までを確定後の文字列で置き換える**
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
 * **`@` は文中にも出る**ので `/` 補完の「先頭かつ空白なし」は使えない。行頭または空白の直後の
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

/**
 * 打った文字列に前方一致→部分一致で絞り込んだパス。合計最大 {@link MAX_FILE_SUGGESTIONS} 件。
 * 大文字小文字は区別しない。
 */
export function matchingFilePaths(paths: readonly string[], term: string): readonly string[] {
  const needle = term.toLowerCase()
  const sorted = sortBy(paths, identity())
  const prefixMatches = sorted.filter((path) => path.toLowerCase().startsWith(needle))
  const partialMatches = sorted.filter(
    (path) => !path.toLowerCase().startsWith(needle) && path.toLowerCase().includes(needle),
  )
  return [...prefixMatches, ...partialMatches].slice(0, MAX_FILE_SUGGESTIONS)
}

export type FileSuggestionsProps = {
  readonly matches: readonly string[]
  readonly selectedIndex: number
  /** マウスで押した（`mousedown`）。既定動作（フォーカス移動）は呼び出し側で止める。 */
  readonly onSelect: (index: number) => void
}

/**
 * `@` 補完の候補一覧。`matches` が空のときは何も出さない（`/` 補完と同じ重ねポップアップの
 * 見た目を使う。dispatch.module.css）。
 */
export function FileSuggestions(props: FileSuggestionsProps): ReactElement | null {
  if (props.matches.length === 0) {
    return null
  }

  return (
    <ul className={styles["dispatch-suggestions"]}>
      {props.matches.map((path, index) => (
        <li
          key={path}
          className={`${styles["dispatch-suggestion-item"]}${
            index === props.selectedIndex ? ` ${styles["is-selected"]}` : ""
          }`}
          onMouseDown={(event) => {
            // mousedown の既定動作（フォーカス移動）を止め、textarea にフォーカスを残す
            // （`/` 補完の候補一覧と同じ理由）。
            event.preventDefault()
            props.onSelect(index)
          }}
        >
          <span className={styles["dispatch-suggestion-path"]}>{path}</span>
        </li>
      ))}
    </ul>
  )
}
