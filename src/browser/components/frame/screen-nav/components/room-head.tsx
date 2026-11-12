// 新しい器「舞台と紙」の部屋の頭の器。舞台の左上に置き、ほかの画面への入口をここにまとめる。
// 2列の格子に、部屋の名前（押すとセッションの一覧）と仕事・雑談の切り替え、状態と「文脈 n%」、ほかの画面の札と探す（⌘K）を並べる。
// フックも算出も持たず、受け取った値と呼び先をそのまま置く。

import type { ReactElement } from "react"

import { Segmented } from "../../../ui/segmented/segmented.tsx"
import type { RoomHeadView } from "../hooks/use-room-head.ts"
import styles from "./room-head.module.css"
import { RoomSessionMenu } from "./room-session-menu.tsx"
import { SearchPalette } from "./search-palette.tsx"

const MODE_OPTIONS = [
  { value: "work", label: "仕事" },
  { value: "chat", label: "雑談" },
] as const

export function PresentationalRoomHead(props: RoomHeadView): ReactElement {
  return (
    <div className={styles["room-head"]} data-region="room-head">
      <button
        type="button"
        className={styles["room-head-pick"]}
        aria-haspopup="dialog"
        aria-expanded={props.sessionsOpen}
        onClick={props.onOpenSessions}
      >
        {props.title}
        <span className={styles["room-head-pick-mark"]} aria-hidden="true" />
      </button>
      <div className={styles["room-head-mode"]} title={props.modeBlockedTitle}>
        <Segmented
          ariaLabel="仕事と雑談の切り替え"
          value={props.chatMode ? "chat" : "work"}
          options={MODE_OPTIONS}
          onChange={(value) => {
            props.onChangeMode(value === "chat")
          }}
        />
      </div>
      <div className={styles["room-head-state"]} data-state={props.state.tone}>
        <i aria-hidden="true" />
        {props.state.label}
      </div>
      <a
        className={styles["room-head-meter"]}
        href={props.context.href}
        aria-current={props.context.current ? "page" : undefined}
        aria-busy={props.context.busy}
      >
        <i
          aria-hidden="true"
          style={{ "--room-head-meter-fill": `${String(props.context.fill)}%` }}
        />
        {props.context.label}
      </a>
      <nav className={styles["room-head-nav"]} aria-label="ほかの画面">
        {props.gates.map((gate) => (
          <a
            key={gate.screen}
            className={styles["room-head-gate"]}
            href={gate.href}
            aria-current={gate.current ? "page" : undefined}
          >
            {gate.label}
          </a>
        ))}
      </nav>
      <button
        type="button"
        className={styles["room-head-search"]}
        aria-haspopup="dialog"
        aria-expanded={props.search.open}
        onClick={props.search.onOpen}
      >
        探す
        <kbd>⌘K</kbd>
      </button>
      <RoomSessionMenu switcher={props.switcher} title={props.title} />
      <SearchPalette search={props.search} />
    </div>
  )
}
