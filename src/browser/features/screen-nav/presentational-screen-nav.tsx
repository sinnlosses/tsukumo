// 画面のナビの帯の**器だけ**（docs/design.md 2章「機能の中を分ける」/ 13.9）。フックも算出も
// 持たず、受け取った値と呼び先をそのまま置く。
//
// **全画面の最上部に出る1本の帯**で、部屋の名前が左端、3つの口（会話 / キャラクター /
// トークン消費）がその右、いまの動き方の読み（`<ScreenNavStatus>`）と答え待ちの印が右端。
// **狭い画面では `<ScreenNavMenu>` の「≡」に畳む**（どちらを出すかは `screen-nav.module.css` の
// `@media` が決める）。
//
// **`data-screen` でいま出している画面を名乗る**のは、狭い画面で帯の置き方が変わるため
// （会話の画面だけは、いまあるタブ帯の右端に重ねる。13.9）。

import { type ReactElement, type RefObject } from "react"

import { type Screen } from "../../stores/screen.tsx"
import { ScreenNavGate } from "./components/screen-nav-gate.tsx"
import { ScreenNavMenu } from "./components/screen-nav-menu.tsx"
import { ScreenNavPending } from "./components/screen-nav-pending.tsx"
import { ScreenNavRoom } from "./components/screen-nav-room.tsx"
import { ScreenNavStatus } from "./components/screen-nav-status.tsx"
import { type ScreenNavGate as Gate, type ScreenNavReading } from "./hooks/use-screen-nav.ts"
import styles from "./screen-nav.module.css"

export type PresentationalScreenNavProps = {
  readonly current: Screen
  /** この tsukumo の部屋の名前（13.9）。 */
  readonly room: string
  readonly gates: readonly Gate[]
  /** いまの動き方の読み（モデル・許可モード）。 */
  readonly readings: readonly ScreenNavReading[]
  readonly pendingActive: boolean
  readonly menuOpen: boolean
  /** 帯そのものに付ける ref（外側を押したときに「≡」を閉じるための基準）。 */
  readonly ref: RefObject<HTMLElement | null>
  readonly onToggleMenu: () => void
  readonly onSelect: () => void
}

/**
 * **props はここだけ分解して受ける**（`ref` を `props.ref` の形で描画中に読むと
 * `react(refs)` が落ちるため。`presentational-task-board.tsx` と同じ）。
 */
export function PresentationalScreenNav({
  current,
  room,
  gates,
  readings,
  pendingActive,
  menuOpen,
  ref,
  onToggleMenu,
  onSelect,
}: PresentationalScreenNavProps): ReactElement {
  return (
    <nav className={styles["screen-nav"]} aria-label="画面" data-screen={current} ref={ref}>
      <ScreenNavRoom name={room} />
      <div className={styles["screen-nav-gates"]}>
        {gates.map((gate) => (
          <ScreenNavGate key={gate.screen} gate={gate} onSelect={onSelect} />
        ))}
      </div>
      <ScreenNavStatus readings={readings} />
      {pendingActive ? <ScreenNavPending /> : null}
      <ScreenNavMenu
        room={room}
        gates={gates}
        readings={readings}
        open={menuOpen}
        pendingActive={pendingActive}
        onToggle={onToggleMenu}
        onSelect={onSelect}
      />
    </nav>
  )
}
