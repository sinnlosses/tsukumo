// 画面のナビの帯の**器だけ**（docs/design.md 2章「機能の中を分ける」/ docs/screen-design.md 13.9）。フックも算出も
// 持たず、受け取った値と呼び先をそのまま置く。
//
// **全画面の最上部に出る1本の帯**で、顔と部屋の名前（名乗りの塊）が左端、その右に仕事/雑談の
// トグル、縦の仕切り、3つの口（会話 / キャラクター / トークン消費）、その右に「いまの作業」の札、
// その右にモデル・許可モードのドロップダウン、**いちばん右端に設定の歯車**。**狭い画面では
// `<ScreenNavMenu>` の「≡」に畳む**（どちらを出すかは `screen-nav.module.css` の `@media` が決める）。
//
// **`data-screen` でいま出している画面を名乗る**のは、狭い画面で帯の置き方が変わるため
// （会話の画面だけは、いまあるタブ帯の右端に重ねる。13.9）。

import { type ReactElement } from "react"

import { CharacterFace } from "../../components/domain/character-face.tsx"
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
 *
 * **部品の値は束（`parts`）のまま `<ScreenNavMenu>` へ渡す**（項目ごとに配り直さない。
 * `hooks/use-screen-nav.ts` の `ScreenNavParts`）。ここが持つのは**広い画面の並び**
 * だけで、「≡」の面の並びは `components/screen-nav-menu.tsx` の側にある。
 */
export function PresentationalScreenNav({
  current,
  parts,
  menu,
  ref,
}: PresentationalScreenNavProps): ReactElement {
  return (
    <nav className={styles["screen-nav"]} aria-label="画面" data-screen={current} ref={ref}>
      <div className={styles["screen-nav-identity"]}>
        <CharacterFace
          url={parts.face.url}
          alt={parts.face.alt}
          className={styles["screen-nav-face"] ?? ""}
        />
        <ScreenNavRoom name={parts.room} />
      </div>
      <ScreenNavChatModeToggle chatMode={parts.chatMode} />
      <span className={styles["screen-nav-divider"]} aria-hidden="true" />
      <div className={styles["screen-nav-gates"]}>
        {parts.gates.map((gate) => (
          <ScreenNavGate key={gate.screen} gate={gate} onSelect={parts.onSelect} />
        ))}
      </div>
      <ScreenNavCurrentWorkPill work={parts.work} />
      <ScreenNavModelPermissionSelect modelPermission={parts.modelPermission} />
      <ScreenNavSettingsGear settings={parts.settings} />
      <ScreenNavMenu parts={parts} menu={menu} />
    </nav>
  )
}
