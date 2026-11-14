// 部屋の名前から出るセッションの一覧。画面の右上に小さく開く。
// いまの作業ツリーのセッションと「＋ 新しく始める」を先に、ほかの作業ツリーのセッションを後に並べる。
// ↑ ↓ で行を移り、Enter（ボタンの既定）で切り替え、Esc と外側のクリックで閉じる（Esc と外側は `<Dialog>` が持つ）。

import type { KeyboardEvent, ReactElement } from "react"

import { Dialog } from "../../../ui/dialog/dialog.tsx"
import type { ScreenNavSessionSwitcher, SessionSwitcherRow } from "../hooks/use-session-switcher.ts"
import styles from "./room-session-menu.module.css"

type RoomSessionMenuProps = {
  readonly switcher: ScreenNavSessionSwitcher
  /** 部屋の名前（いまの作業ツリーの群の見出しに添える）。 */
  readonly title: string
}

const DIALOG_LABEL = "セッションの切り替え"
const OTHER_ROOMS = "ほかの部屋"
const NEW_SESSION = "＋ 新しく始める"
const CURRENT_NOTE = "いま開いている"
const OCCUPIED_NOTE = "別のウィンドウで使用中"
const NO_SESSIONS = "切り替えられるセッションはまだ無い"

export function RoomSessionMenu(props: RoomSessionMenuProps): ReactElement {
  const { switcher } = props
  const here = switcher.rows.filter((row) => row.inCurrentWorktree)
  const others = switcher.rows.filter((row) => !row.inCurrentWorktree)
  return (
    <Dialog
      open={switcher.open}
      ariaLabel={DIALOG_LABEL}
      backdrop="clear"
      placement={{ kind: "auto" }}
      onClose={switcher.onClose}
      className={styles["room-session-menu"]}
    >
      {switcher.open && (
        <div className={styles["room-session-menu-body"]} onKeyDown={moveFocus}>
          <h4 className={styles["room-session-menu-group"]}>この部屋（{props.title}）</h4>
          {here.length === 0 && <p className={styles["room-session-menu-empty"]}>{NO_SESSIONS}</p>}
          {here.map((row) => (
            <SessionRow key={row.sessionId} row={row} switcher={switcher} />
          ))}
          <button
            type="button"
            className={styles["room-session-menu-row"]}
            disabled={switcher.blocked}
            title={switcher.blockedTitle}
            onClick={switcher.onStartNew}
          >
            {NEW_SESSION}
          </button>
          {others.length > 0 && (
            <>
              <h4 className={styles["room-session-menu-group"]}>{OTHER_ROOMS}</h4>
              {others.map((row) => (
                <SessionRow key={row.sessionId} row={row} switcher={switcher} />
              ))}
            </>
          )}
        </div>
      )}
    </Dialog>
  )
}

function SessionRow(props: {
  readonly row: SessionSwitcherRow
  readonly switcher: ScreenNavSessionSwitcher
}): ReactElement {
  const { row, switcher } = props
  return (
    <button
      type="button"
      className={styles["room-session-menu-row"]}
      aria-current={row.current}
      disabled={row.occupiedElsewhere || (switcher.blocked && !row.current)}
      title={row.current ? undefined : switcher.blockedTitle}
      onClick={() => {
        switcher.onSwitch(row.sessionId)
      }}
    >
      {row.heading}
      <small>{noteOf(row)}</small>
    </button>
  )
}

/** 行の下に添える一言。ほかの作業ツリーの行には、どの作業ツリーかを添える。 */
function noteOf(row: SessionSwitcherRow): string {
  if (row.current) {
    return CURRENT_NOTE
  }
  const time = row.inCurrentWorktree ? row.timeLabel : `${row.worktree}・${row.timeLabel}`
  return row.occupiedElsewhere ? `${time}・${OCCUPIED_NOTE}` : time
}

/** ↑ ↓ で、押せる行のあいだをフォーカスで移る（端では止まる）。 */
function moveFocus(event: KeyboardEvent<HTMLDivElement>): void {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
    return
  }
  event.preventDefault()
  const rows = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:enabled")]
  const at = rows.findIndex((row) => row === document.activeElement)
  const next = event.key === "ArrowDown" ? Math.min(at + 1, rows.length - 1) : Math.max(at - 1, 0)
  rows[next]?.focus()
}
