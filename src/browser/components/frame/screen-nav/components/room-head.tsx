// 新しい器「舞台と紙」の部屋の頭の器。
// 左の群（PresentationalRoomHead）は舞台の左上に置き、仕事と雑談の切り替え・状態を並べる。
// サイドバーの頭（PresentationalRoomSidebarSearch）は部屋の名前（押すとセッションの一覧）と探す（⌘K）の入口、下の入口の行（PresentationalRoomSidebarGates）は文脈 n%・ほかの画面の入口を置く。
// 狭い幅では左の群の代わりに1行の頭（PresentationalRoomNarrowHead）を出し、入口はすべて「≡」から開く探すに畳む。
// フックも算出も持たず、受け取った値と呼び先をそのまま置く。

import type { ReactElement, ReactNode } from "react"

import {
  AchievementIcon,
  CharacterIcon,
  SearchIcon,
  SettingsIcon,
  TokenIcon,
} from "../../../ui/icon/icon.tsx"
import { Segmented } from "../../../ui/segmented/segmented.tsx"
import { CharacterFace } from "../../character-face.tsx"
import type { RoomHeadGate, RoomHeadView } from "../hooks/use-room-head.ts"
import styles from "./room-head.module.css"
import { RoomSessionMenu } from "./room-session-menu.tsx"
import { SearchPalette } from "./search-palette.tsx"

const MODE_OPTIONS = [
  { value: "work", label: "仕事" },
  { value: "chat", label: "雑談" },
] as const

const GATE_ICONS = {
  achievement: <AchievementIcon />,
  character: <CharacterIcon />,
  settings: <SettingsIcon />,
} satisfies Record<RoomHeadGate["screen"], ReactNode>

export function PresentationalRoomHead(props: RoomHeadView): ReactElement {
  return (
    <div className={styles["room-head"]} data-region="room-head">
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
    </div>
  )
}

/**
 * セッションの一覧と探すの2つのダイアログ。
 * 開く口はサイドバーの頭・狭い幅の頭に散るが、狭い幅では舞台ごと隠れるので、どの口からも見えるよう舞台の外に1回だけ置く。
 */
export function PresentationalRoomDialogs(
  props: Pick<RoomHeadView, "switcher" | "title" | "search">,
): ReactElement {
  return (
    <>
      <RoomSessionMenu switcher={props.switcher} title={props.title} />
      <SearchPalette search={props.search} />
    </>
  )
}

/** 狭い幅の頭の題。迎えるでは部屋の頭の主の字、ほかでは最新のやり取りの題。 */
export type RoomNarrowHeadSubject =
  | { readonly kind: "room" }
  | { readonly kind: "turn"; readonly title: string }

const NARROW_MENU_LABEL = "メニューと探す"

/** 狭い幅（760px 以下）の1行の頭。顔・状態・題・「≡」を並べ、「≡」で探すを開く。広い幅では CSS が隠す。 */
export function PresentationalRoomNarrowHead(
  props: Pick<RoomHeadView, "face" | "state" | "title" | "search"> & {
    readonly subject: RoomNarrowHeadSubject
  },
): ReactElement {
  return (
    <header className={styles["room-narrow-head"]} data-region="room-narrow-head">
      <CharacterFace
        url={props.face.url}
        alt={props.face.alt}
        className={styles["room-narrow-head-face"]}
      />
      <div className={styles["room-narrow-head-text"]}>
        <div className={styles["room-head-state"]} data-state={props.state.tone}>
          <i aria-hidden="true" />
          {props.state.label}
        </div>
        <b className={styles["room-narrow-head-title"]}>
          {props.subject.kind === "turn" ? props.subject.title : props.title}
        </b>
      </div>
      <button
        type="button"
        className={styles["room-narrow-head-menu"]}
        aria-label={NARROW_MENU_LABEL}
        aria-haspopup="dialog"
        aria-expanded={props.search.open}
        onClick={props.search.onOpen}
      >
        ≡
      </button>
    </header>
  )
}

/** サイドバーの頭。部屋の名前（押すとセッションの一覧）と、検索の入口（押すと探すが開く）を置く。 */
export function PresentationalRoomSidebarSearch(
  props: Pick<RoomHeadView, "search" | "title" | "sessionsOpen" | "onOpenSessions">,
): ReactElement {
  return (
    <div className={styles["room-side-head"]}>
      <button
        type="button"
        className={styles["room-side-title"]}
        aria-haspopup="dialog"
        aria-expanded={props.sessionsOpen}
        onClick={props.onOpenSessions}
      >
        <span>{props.title}</span>
        <span className={styles["room-side-title-mark"]} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={styles["room-side-search"]}
        aria-haspopup="dialog"
        aria-expanded={props.search.open}
        onClick={props.search.onOpen}
      >
        <SearchIcon />
        <span>検索</span>
        <kbd>⌘K</kbd>
      </button>
    </div>
  )
}

/** サイドバーの下の入口の行。文脈 n%・ほかの画面の入口を <a href> で並べる。 */
export function PresentationalRoomSidebarGates(
  props: Pick<RoomHeadView, "context" | "gates">,
): ReactElement {
  return (
    <nav className={styles["room-side-gates"]} aria-label="ほかの画面">
      <a
        className={styles["room-side-gate"]}
        href={props.context.href}
        aria-current={props.context.current ? "page" : undefined}
        aria-busy={props.context.busy}
      >
        <TokenIcon />
        {props.context.label}
        <i
          aria-hidden="true"
          style={{ "--room-side-meter-fill": `${String(props.context.fill)}%` }}
        />
      </a>
      {props.gates.map((gate) => (
        <a
          key={gate.screen}
          className={styles["room-side-gate"]}
          href={gate.href}
          aria-current={gate.current ? "page" : undefined}
        >
          {GATE_ICONS[gate.screen]}
          {gate.label}
        </a>
      ))}
    </nav>
  )
}
