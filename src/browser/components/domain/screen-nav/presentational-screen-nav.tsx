// 画面のナビの帯の器だけ。フックも算出も持たず、受け取った値と呼び先をそのまま置く。
// 狭い画面では帯の代わりに頭（`<PhoneHead>`）を出し、帯の中身は頭の右上の ≡ から出る引き出し（`<NavDrawer>`）へ移す（どちらを出すかは各部品の CSS の `@media` が決める）。
//
// `data-screen` でいま出している画面を名乗るのは、狭い画面で会話の画面だけページの組み方が変わるため（`theme.css` の `@media`）。
//
// 会話の画面の広い帯には、いまの作業の札とモデル・effort・許可モードを置かない。
// 札の役はメインビューの進み具合の帯（`WorkStrip`）、3つの操作子はサイドバーの下端の帯（中くらいの窓幅では柱）が持つ。
// 引き出しはどの画面でも同じ中身を持つ（狭い画面ではサイドバーとメインビューが同時に見えないため）。いまの作業は頭が持つ。
//
// 引き出しは `<nav>` の中に置く（キャラクターの選び口などが「帯の外側を押した」かを `ref` の中かで見るため）。

import type { ReactElement } from "react"

import { CurrentWorkPill } from "../../../features/current-work/components/current-work-pill.tsx"
import { NavDrawer, NavDrawerToggle, type NavDrawerSlots } from "./components/nav-drawer.tsx"
import { PhoneHead } from "./components/phone-head.tsx"
import { ScreenNavCharacterPicker } from "./components/screen-nav-character-picker.tsx"
import { ScreenNavChatModeToggle } from "./components/screen-nav-chat-mode.tsx"
import { ScreenNavGate } from "./components/screen-nav-gate.tsx"
import { ScreenNavModelPermissionSelect } from "./components/screen-nav-model-permission.tsx"
import { ScreenNavSessionTag } from "./components/screen-nav-session-tag.tsx"
import { ScreenNavSettingsGear } from "./components/screen-nav-settings.tsx"
import { SessionSwitcher } from "./components/session-switcher.tsx"
import type { ScreenNavView } from "./hooks/use-screen-nav.ts"
import styles from "./screen-nav.module.css"

export type PresentationalScreenNavProps = ScreenNavView & {
  readonly slots: NavDrawerSlots
}

/**
 * props はここだけ分解して受ける（`ref` を `props.ref` の形で描画中に読むと `react(refs)` が落ちるため）。
 *
 * ここが持つのは広い画面の並びだけで、引き出しの並びは {@link NavDrawer} の側にある。
 */
export function PresentationalScreenNav({
  current,
  parts,
  switcher,
  drawer,
  head,
  ref,
  slots,
}: PresentationalScreenNavProps): ReactElement {
  return (
    <>
      <nav className={styles["screen-nav"]} aria-label="画面" data-screen={current} ref={ref}>
        <div className={styles["screen-nav-identity"]}>
          <ScreenNavCharacterPicker picker={parts.character} />
          <ScreenNavSessionTag tag={parts.sessionTag} placement="screen-nav" />
        </div>
        <ScreenNavChatModeToggle chatMode={parts.chatMode} />
        <span className={styles["screen-nav-divider"]} aria-hidden="true" />
        <div className={styles["screen-nav-gates"]}>
          {parts.gates.map((gate) => (
            <ScreenNavGate key={gate.screen} gate={gate} onSelect={parts.onSelect} />
          ))}
        </div>
        {current !== "conversation" && (
          <>
            <div className={styles["screen-nav-work-slot"]}>
              <CurrentWorkPill work={parts.work} />
            </div>
            <ScreenNavModelPermissionSelect modelPermission={parts.modelPermission} />
          </>
        )}
        <ScreenNavSettingsGear settings={parts.settings} />
        <PhoneHead
          head={head}
          work={parts.work}
          drawerToggle={<NavDrawerToggle drawer={drawer} />}
        />
        <NavDrawer parts={parts} drawer={drawer} slots={slots} />
        <SessionSwitcher switcher={switcher} character={parts.character.face} />
      </nav>
    </>
  )
}
