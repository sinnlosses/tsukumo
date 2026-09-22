// 狭い画面（760px 以下）の「≡」と、押すと落ちてくる3つの口（docs/design.md 13.9）。
// **広い画面では CSS で消える**（`screen-nav.module.css` の `@media`）ので、ここは幅を測らない。
//
// **落ちてくる口は開いている間だけの要素**（閉じているときは描かない）。奪う面積を
// タブ帯の右端の 44px だけに保つための形で、開いている間は上に重ねて出す（段を増やさない）。
//
// **答え待ちは閉じていても分かるようにする**。狭い画面では「答え待ち」の字を帯に置く幅が
// 無いので、閉じている間は「≡」に印（`●`）を添え、開いたら字で出す（**印の有無という形**でも
// 伝わるので、色だけに頼らない。13.1 原則1）。

import { type ReactElement } from "react"

import { type ScreenNavGate as Gate, type ScreenNavReading } from "../hooks/use-screen-nav.ts"
import styles from "../screen-nav.module.css"
import { ScreenNavGate } from "./screen-nav-gate.tsx"
import { PENDING_NOTE, ScreenNavPending } from "./screen-nav-pending.tsx"
import { ScreenNavRoom } from "./screen-nav-room.tsx"
import { ScreenNavStatus } from "./screen-nav-status.tsx"

export type ScreenNavMenuProps = {
  /** 部屋の名前。**落ちてくる面の先頭**に出す（狭い画面では帯の左端が無いため。13.9）。 */
  readonly room: string
  readonly gates: readonly Gate[]
  /** いまの動き方の読み。**狭い画面では帯に置く幅が無い**ので、口と同じくここへ入る（13.9）。 */
  readonly readings: readonly ScreenNavReading[]
  readonly open: boolean
  readonly pendingActive: boolean
  readonly onToggle: () => void
  readonly onSelect: () => void
}

/** 「≡」の字と、読み上げに渡す名前。 */
const MENU_MARK = "≡"
const MENU_LABEL = "画面を選ぶ"

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
          {props.gates.map((gate) => (
            <ScreenNavGate key={gate.screen} gate={gate} onSelect={props.onSelect} />
          ))}
          <ScreenNavStatus readings={props.readings} />
          {props.pendingActive ? <ScreenNavPending /> : null}
        </div>
      ) : null}
    </div>
  )
}
