// 画面のナビの帯の**器だけ**（docs/design.md 2章「機能の中を分ける」/ 13.9）。フックも算出も
// 持たず、受け取った値と呼び先をそのまま置く。
//
// **全画面の最上部に出る1本の帯**で、3つの口（会話 / キャラクター / トークン消費）が左、
// 答え待ちの印が右端。**狭い画面では `<ScreenNavMenu>` の「≡」に畳む**（どちらを出すかは
// `screen-nav.module.css` の `@media` が決める）。
//
// **`data-screen` でいま出している画面を名乗る**のは、狭い画面で帯の置き方が変わるため
// （会話の画面だけは、いまあるタブ帯の右端に重ねる。13.9）。

import { type ReactElement, type RefObject } from "react"

import { type Screen } from "../../stores/screen.tsx"
import { ScreenNavGate } from "./components/screen-nav-gate.tsx"
import { ScreenNavMenu } from "./components/screen-nav-menu.tsx"
import { ScreenNavPending } from "./components/screen-nav-pending.tsx"
import { type ScreenNavGate as Gate } from "./hooks/use-screen-nav.ts"
import styles from "./screen-nav.module.css"

export type PresentationalScreenNavProps = {
  readonly current: Screen
  readonly gates: readonly Gate[]
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
  gates,
  pendingActive,
  menuOpen,
  ref,
  onToggleMenu,
  onSelect,
}: PresentationalScreenNavProps): ReactElement {
  return (
    <nav className={styles["screen-nav"]} aria-label="画面" data-screen={current} ref={ref}>
      <div className={styles["screen-nav-gates"]}>
        {gates.map((gate) => (
          <ScreenNavGate key={gate.screen} gate={gate} onSelect={onSelect} />
        ))}
      </div>
      {pendingActive ? <ScreenNavPending /> : null}
      <ScreenNavMenu
        gates={gates}
        open={menuOpen}
        pendingActive={pendingActive}
        onToggle={onToggleMenu}
        onSelect={onSelect}
      />
    </nav>
  )
}
