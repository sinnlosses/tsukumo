// 入力欄の `/` コマンド補完。絞り込みの純粋関数と、一覧を描くだけの部品。
// 候補は `SessionState`（`commandDescriptions` / `slashCommands`）から直接引く。
//
// 前方一致を先に、続けて部分一致を出す。
// 各グループの中はアルファベット順で、合計最大 `MAX_COMMAND_SUGGESTIONS` 件（Claude Code の TUI の絞り方に合わせた）。
// キー操作（上下・Tab・Enter・Esc）と確定・送信の判断は呼び出し側が持つ（送信の Enter と同じ `keydown` を共有するため）。

import clsx from "clsx"
import type { ReactElement } from "react"
import { prop, sortBy } from "remeda"

import type { CommandDescription } from "../../../../../../../../shared/session/session-event.ts"
import { Text } from "../../../../../../ui/text/text.tsx"
import dispatchStyles from "../../dispatch.module.css"
import styles from "./command-suggestions.module.css"

export const MAX_COMMAND_SUGGESTIONS = 10

/** 空白1文字。入力に空白が混じっていないかの判定に使う。 */
const WHITESPACE_PATTERN = /\s/

/** 入力の先頭が `/` で、まだ空白が無く、答え待ちが無いときだけ候補を出す。 */
export function shouldShowCommandSuggestions(value: string, pendingActive: boolean): boolean {
  return value.startsWith("/") && !WHITESPACE_PATTERN.test(value) && !pendingActive
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
  const prefixMatches = sortBy(
    commands.filter((command) => command.name.startsWith(prefix)),
    prop("name"),
  )
  const partialMatches = sortBy(
    commands.filter((command) => !command.name.startsWith(prefix) && command.name.includes(prefix)),
    prop("name"),
  )
  return [...prefixMatches, ...partialMatches].slice(0, MAX_COMMAND_SUGGESTIONS)
}

export type CommandSuggestionsProps = {
  readonly matches: readonly CommandDescription[]
  readonly selectedIndex: number
  /** マウスで押した（`mousedown`）。既定動作（フォーカス移動）は呼び出し側で止める。 */
  readonly onSelect: (index: number) => void
}

/**
 * `/` 補完の候補一覧。`matches` が空のときは何も出さない。
 * `.dispatch-text-wrap` の中で `position: absolute` の重ねポップアップになる。
 */
export function CommandSuggestions(props: CommandSuggestionsProps): ReactElement | null {
  if (props.matches.length === 0) {
    return null
  }

  return (
    <ul className={dispatchStyles["dispatch-suggestions"]}>
      {props.matches.map((command, index) => (
        <li
          key={command.name}
          className={clsx(
            dispatchStyles["dispatch-suggestion-item"],
            index === props.selectedIndex && dispatchStyles["is-selected"],
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
            className={styles["dispatch-suggestion-name"]}
          >
            /{command.name}
          </Text>
          {command.description !== undefined && command.description !== "" && (
            <Text
              element="span"
              size="secondary"
              tone="ink-quiet"
              weight="inherit"
              className={styles["dispatch-suggestion-description"]}
            >
              {command.description}
            </Text>
          )}
        </li>
      ))}
    </ul>
  )
}
