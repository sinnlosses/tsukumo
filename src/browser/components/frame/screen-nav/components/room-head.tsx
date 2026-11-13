// 新しい器「舞台と紙」の部屋の頭の器。2つの部品に分かれる。
// 左の群（PresentationalRoomHead）は舞台の左上に置き、部屋の名前（押すとセッションの一覧）・仕事と雑談の切り替え・状態を並べる。
// 右上の群（PresentationalRoomTools）は舞台の器の右上に置き、文脈 n%・ほかの画面の入口・探す（⌘K）をアイコンつきのボタンで並べる。
// フックも算出も持たず、受け取った値と呼び先をそのまま置く。

import type { ReactElement, ReactNode } from "react"

import {
  AchievementIcon,
  CharacterIcon,
  ListIcon,
  SearchIcon,
  SettingsIcon,
  TokenIcon,
} from "../../../ui/icon/icon.tsx"
import { Segmented } from "../../../ui/segmented/segmented.tsx"
import type { RoomHeadGate, RoomHeadView } from "../hooks/use-room-head.ts"
import styles from "./room-head.module.css"
import { RoomSessionMenu } from "./room-session-menu.tsx"
import { SearchPalette } from "./search-palette.tsx"

const MODE_OPTIONS = [
  { value: "work", label: "仕事" },
  { value: "chat", label: "雑談" },
] as const

const GATE_ICONS = {
  tasks: <ListIcon />,
  achievement: <AchievementIcon />,
  character: <CharacterIcon />,
  settings: <SettingsIcon />,
} satisfies Record<RoomHeadGate["screen"], ReactNode>

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
      <RoomSessionMenu switcher={props.switcher} title={props.title} />
      <SearchPalette search={props.search} />
    </div>
  )
}

export function PresentationalRoomTools(
  props: Pick<RoomHeadView, "context" | "gates" | "search">,
): ReactElement {
  return (
    <div className={styles["room-tools"]} data-region="room-tools">
      <a
        className={styles["room-tools-button"]}
        href={props.context.href}
        aria-current={props.context.current ? "page" : undefined}
        aria-busy={props.context.busy}
      >
        <TokenIcon />
        {props.context.label}
        <i
          aria-hidden="true"
          style={{ "--room-tools-meter-fill": `${String(props.context.fill)}%` }}
        />
      </a>
      <nav className={styles["room-tools-nav"]} aria-label="ほかの画面">
        {props.gates.map((gate) => (
          <a
            key={gate.screen}
            className={styles["room-tools-button"]}
            href={gate.href}
            aria-current={gate.current ? "page" : undefined}
          >
            {GATE_ICONS[gate.screen]}
            {gate.label}
          </a>
        ))}
      </nav>
      <button
        type="button"
        className={styles["room-tools-button"]}
        aria-haspopup="dialog"
        aria-expanded={props.search.open}
        onClick={props.search.onOpen}
      >
        <SearchIcon />
        探す
        <kbd>⌘K</kbd>
      </button>
    </div>
  )
}
