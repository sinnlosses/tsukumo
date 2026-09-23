// 狭い画面（760px 以下）の「≡」と、押すと落ちてくる面（docs/design.md 13.9）。
// **広い画面では CSS で消える**（`screen-nav.module.css` の `@media`）ので、ここは幅を測らない。
//
// **落ちてくる面は開いている間だけの要素**（閉じているときは描かない）。奪う面積を
// タブ帯の右端の 44px だけに保つための形で、開いている間は上に重ねて出す（段を増やさない）。
//
// **落ちてくる面の並びは 顔と部屋の名前 → トグル → 3つの口 → いまの作業 → モデル・許可モード**
// （13.9「狭い画面」。いまの作業と顔は T-382 / T-383 が足す）。振る舞い（ターン進行中の扱い・
// 送るコマンド）は広い画面と同じ部品をそのまま使う。
//
// **答え待ちは閉じていても分かるようにする**。狭い画面では「答え待ち」の字を帯に置く幅が
// 無いので、閉じている間は「≡」に印（`●`）を添え、開いたら字で出す（**印の有無という形**でも
// 伝わるので、色だけに頼らない。13.1 原則1）。

import { type ReactElement } from "react"

import {
  type ScreenNavChatMode,
  type ScreenNavGate as Gate,
  type ScreenNavModelPermission,
} from "../hooks/use-screen-nav.ts"
import styles from "../screen-nav.module.css"
import { ScreenNavChatModeToggle } from "./screen-nav-chat-mode.tsx"
import { ScreenNavGate } from "./screen-nav-gate.tsx"
import { ScreenNavModelPermissionSelect } from "./screen-nav-model-permission.tsx"
import { PENDING_NOTE, ScreenNavPending } from "./screen-nav-pending.tsx"
import { ScreenNavRoom } from "./screen-nav-room.tsx"

export type ScreenNavMenuProps = {
  /** 部屋の名前。**落ちてくる面の先頭**に出す（狭い画面では帯の左端が無いため。13.9）。 */
  readonly room: string
  readonly gates: readonly Gate[]
  /** 仕事 / 雑談のトグル。**狭い画面では帯に置く幅が無い**ので、口と同じくここへ入る（13.9）。 */
  readonly chatMode: ScreenNavChatMode
  /** モデル・許可モードのドロップダウン。 */
  readonly modelPermission: ScreenNavModelPermission
  readonly open: boolean
  readonly pendingActive: boolean
  readonly onToggle: () => void
  readonly onSelect: () => void
}

/** 「≡」の字と、読み上げに渡す名前。**「画面を選ぶ」から「メニュー」に直した**
 * （画面を選ぶだけの面ではなくなったため。13.9「狭い画面」）。 */
const MENU_MARK = "≡"
const MENU_LABEL = "メニュー"

/** 閉じている間の答え待ちの印。 */
const PENDING_MARK = "●"

export function ScreenNavMenu(props: ScreenNavMenuProps): ReactElement {
  return (
    <div className={styles["screen-nav-menu"]}>
      <button
        type="button"
        className={styles["screen-nav-toggle"]}
        aria-expanded={props.open}
        aria-label={props.pendingActive ? `${MENU_LABEL}（${PENDING_NOTE}）` : MENU_LABEL}
        onClick={props.onToggle}
      >
        {MENU_MARK}
        {props.pendingActive ? (
          <span className={styles["screen-nav-toggle-mark"]}>{PENDING_MARK}</span>
        ) : null}
      </button>
      {props.open ? (
        <div className={styles["screen-nav-panel"]}>
          <ScreenNavRoom name={props.room} />
          <ScreenNavChatModeToggle chatMode={props.chatMode} />
          {props.gates.map((gate) => (
            <ScreenNavGate key={gate.screen} gate={gate} onSelect={props.onSelect} />
          ))}
          {props.pendingActive ? <ScreenNavPending /> : null}
          <ScreenNavModelPermissionSelect modelPermission={props.modelPermission} />
        </div>
      ) : null}
    </div>
  )
}
