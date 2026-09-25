// 入力欄の `/` コマンド補完。**入力の先頭が `/` で、まだ空白が無く、答え待ちが無いときだけ**
// 候補を出す（docs/display.md 4.2「入力欄」）。候補は `SessionState` から直接引ける
// （`commandSuggestions`。旧の GET の経路で毎回取りに行く fetch は無くなった —
// `SessionState.commandDescriptions` / `slashCommands` がすでに WebSocket で届いている）。
//
// **前方一致を先に、続けて部分一致を出す。各グループの中はアルファベット順で、合計最大
// {@link MAX_COMMAND_SUGGESTIONS} 件**（Claude Code の TUI の絞り方に合わせた）。
// キー操作（上下・Tab・Enter・Esc）と確定・送信の判断は呼び出し側（`hooks/use-composer.ts`）が持つ
// （送信の Enter と同じ `keydown` を共有するため）。ここは絞り込みの純粋関数と、一覧を描く
// だけの部品。

import { type ReactElement } from "react"

import { type CommandDescription } from "../../../../../shared/session-event.ts"
import styles from "./dispatch.module.css"

export const MAX_COMMAND_SUGGESTIONS = 10

/** 空白1文字。入力に空白が混じっていないかの判定に使う。 */
const WHITESPACE_PATTERN = /\s/

/** 入力の先頭が `/` で、まだ空白が無く、答え待ちが無いときだけ候補を出す。 */
export function shouldShowCommandSuggestions(value: string, pendingActive: boolean): boolean {
  return value.startsWith("/") && !WHITESPACE_PATTERN.test(value) && !pendingActive
}

function byName(left: CommandDescription, right: CommandDescription): number {
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0
}

/**
 * 入力の値（先頭の `/` を含む）に前方一致→部分一致で絞り込んだ候補。合計最大
 * {@link MAX_COMMAND_SUGGESTIONS} 件。
 */
export function matchingCommands(
  commands: readonly CommandDescription[],
  value: string,
): readonly CommandDescription[] {
  const prefix = value.slice(1)
  const prefixMatches = commands
    .filter((command) => command.name.startsWith(prefix))
    .toSorted(byName)
  const partialMatches = commands
    .filter((command) => !command.name.startsWith(prefix) && command.name.includes(prefix))
    .toSorted(byName)
  return [...prefixMatches, ...partialMatches].slice(0, MAX_COMMAND_SUGGESTIONS)
}

export type CommandSuggestionsProps = {
  readonly matches: readonly CommandDescription[]
  readonly selectedIndex: number
  /** マウスで押した（`mousedown`）。既定動作（フォーカス移動）は呼び出し側で止める。 */
  readonly onSelect: (index: number) => void
}

/**
 * `/` 補完の候補一覧。`matches` が空のときは何も出さない（`<Composer>` の `.dispatch-text-wrap`
 * の中で `position: absolute` の重ねポップアップになる。dispatch.module.css）。
 */
export function CommandSuggestions(props: CommandSuggestionsProps): ReactElement | null {
  if (props.matches.length === 0) {
    return null
  }

  return (
    <ul className={styles["dispatch-suggestions"]}>
      {props.matches.map((command, index) => (
        <li
          key={command.name}
          className={`${styles["dispatch-suggestion-item"]}${
            index === props.selectedIndex ? ` ${styles["is-selected"]}` : ""
          }`}
          onMouseDown={(event) => {
            // mousedown の既定動作（フォーカス移動）を止め、textarea にフォーカスを残す
            // （旧 command-suggestions.ts と同じ理由）。
            event.preventDefault()
            props.onSelect(index)
          }}
        >
          <span className={styles["dispatch-suggestion-name"]}>/{command.name}</span>
          {command.description === undefined || command.description === "" ? null : (
            <span className={styles["dispatch-suggestion-description"]}>{command.description}</span>
          )}
        </li>
      ))}
    </ul>
  )
}
