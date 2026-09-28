// 画面のナビの帯の器だけ。フックも算出も持たず、受け取った値と呼び先をそのまま置く。
// 狭い画面では `<ScreenNavMenu>` の「≡」に畳む（どちらを出すかは `screen-nav.module.css` の `@media` が決める）。
//
// `data-screen` でいま出している画面を名乗るのは、狭い画面で帯の置き方が変わるため。
// 会話の画面だけは、いまあるタブ帯の右端に重ねる。

import type { ReactElement } from "react"

import { ScreenNavCharacterPicker } from "./components/screen-nav-character-picker.tsx"
import { ScreenNavChatModeToggle } from "./components/screen-nav-chat-mode.tsx"
import { ScreenNavCurrentWorkPill } from "./components/screen-nav-current-work.tsx"
import { ScreenNavGate } from "./components/screen-nav-gate.tsx"
import { ScreenNavMenu } from "./components/screen-nav-menu.tsx"
import { ScreenNavModelPermissionSelect } from "./components/screen-nav-model-permission.tsx"
import { ScreenNavSessionTag } from "./components/screen-nav-session-tag.tsx"
import { ScreenNavSettingsGear } from "./components/screen-nav-settings.tsx"
import { SessionSwitcher } from "./components/session-switcher.tsx"
import type { ScreenNavView } from "./hooks/use-screen-nav.ts"
import styles from "./screen-nav.module.css"

export type PresentationalScreenNavProps = ScreenNavView

/**
 * props はここだけ分解して受ける（`ref` を `props.ref` の形で描画中に読むと `react(refs)` が落ちるため）。
 *
 * ここが持つのは広い画面の並びだけで、「≡」の面の並びは {@link ScreenNavMenu} の側にある。
 */
export function PresentationalScreenNav({
  current,
  parts,
  switcher,
  menu,
  ref,
}: PresentationalScreenNavProps): ReactElement {
  return (
    <nav className={styles["screen-nav"]} aria-label="画面" data-screen={current} ref={ref}>
      <div className={styles["screen-nav-identity"]}>
        <ScreenNavCharacterPicker picker={parts.character} />
        <ScreenNavSessionTag tag={parts.sessionTag} onOpened={parts.onSelect} />
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
      <SessionSwitcher switcher={switcher} character={parts.character.face} />
    </nav>
  )
}
