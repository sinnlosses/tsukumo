// 画面のナビの帯の**器だけ**（docs/design.md 2章「機能の中を分ける」/ 13.9）。フックも算出も
// 持たず、受け取った値と呼び先をそのまま置く。
//
// **全画面の最上部に出る1本の帯**で、部屋の名前が左端、その右に仕事/雑談のトグル、その右に
// 3つの口（会話 / キャラクター / トークン消費）、その右に「いまの作業」の札、その右にモデル・
// 許可モードのドロップダウン、**いちばん右端に設定の歯車**。**狭い画面では `<ScreenNavMenu>` の
// 「≡」に畳む**（どちらを出すかは `screen-nav.module.css` の `@media` が決める）。
//
// **`data-screen` でいま出している画面を名乗る**のは、狭い画面で帯の置き方が変わるため
// （会話の画面だけは、いまあるタブ帯の右端に重ねる。13.9）。

import { type ReactElement } from "react"

import { ScreenNavChatModeToggle } from "./components/screen-nav-chat-mode.tsx"
import { ScreenNavCurrentWorkPill } from "./components/screen-nav-current-work.tsx"
import { ScreenNavGate } from "./components/screen-nav-gate.tsx"
import { ScreenNavMenu } from "./components/screen-nav-menu.tsx"
import { ScreenNavModelPermissionSelect } from "./components/screen-nav-model-permission.tsx"
import { ScreenNavRoom } from "./components/screen-nav-room.tsx"
import { ScreenNavSettingsGear } from "./components/screen-nav-settings.tsx"
import { type ScreenNavView } from "./hooks/use-screen-nav.ts"
import styles from "./screen-nav.module.css"

export type PresentationalScreenNavProps = ScreenNavView

/**
 * **props はここだけ分解して受ける**（`ref` を `props.ref` の形で描画中に読むと
 * `react(refs)` が落ちるため。`presentational-task-board.tsx` と同じ）。
 */
export function PresentationalScreenNav({
  current,
  room,
  gates,
  chatMode,
  modelPermission,
  pendingActive,
  work,
  workToggleRefWide,
  workToggleRefNarrow,
  settings,
  settingsToggleRefWide,
  settingsToggleRefNarrow,
  menuOpen,
  ref,
  onToggleMenu,
  onSelect,
}: PresentationalScreenNavProps): ReactElement {
  return (
    <nav className={styles["screen-nav"]} aria-label="画面" data-screen={current} ref={ref}>
      <ScreenNavRoom name={room} />
      <ScreenNavChatModeToggle chatMode={chatMode} />
      <div className={styles["screen-nav-gates"]}>
        {gates.map((gate) => (
          <ScreenNavGate key={gate.screen} gate={gate} onSelect={onSelect} />
        ))}
      </div>
      <ScreenNavCurrentWorkPill work={work} toggleRef={workToggleRefWide} />
      <ScreenNavModelPermissionSelect modelPermission={modelPermission} />
      <ScreenNavSettingsGear settings={settings} toggleRef={settingsToggleRefWide} />
      <ScreenNavMenu
        room={room}
        gates={gates}
        chatMode={chatMode}
        modelPermission={modelPermission}
        work={work}
        workToggleRefNarrow={workToggleRefNarrow}
        settings={settings}
        settingsToggleRefNarrow={settingsToggleRefNarrow}
        open={menuOpen}
        pendingActive={pendingActive}
        onToggle={onToggleMenu}
        onSelect={onSelect}
      />
    </nav>
  )
}
