// 帯に並ぶ口1つ。ただのリンクなので、リロードで同じ画面に戻り、ブラウザの「戻る」も効く。
// 押せない口（`restartRefused` の間の、いまと違うモードの口）は移動も送信もしない。

import clsx from "clsx"
import type { MouseEvent, ReactElement } from "react"

import {
  AchievementIcon,
  CharacterIcon,
  ChatIcon,
  TokenIcon,
  WorkIcon,
} from "../../../ui/icon/icon.tsx"
import type { ScreenNavGate as Gate } from "../hooks/use-screen-nav.ts"
import styles from "./screen-nav-gate.module.css"

const GATE_ICONS = {
  work: <WorkIcon />,
  chat: <ChatIcon />,
  character: <CharacterIcon />,
  token: <TokenIcon />,
  achievement: <AchievementIcon />,
} satisfies Record<Gate["icon"], ReactElement>

type ScreenNavGateProps = {
  readonly gate: Gate
  /** 押したあとに引き出しを閉じる呼び先（広い画面では開いていないので何も起きない）。 */
  readonly onSelect: () => void
}

export function ScreenNavGate(props: ScreenNavGateProps): ReactElement {
  const { gate } = props

  function onClick(event: MouseEvent<HTMLAnchorElement>): void {
    if (gate.disabled) {
      event.preventDefault()
      return
    }
    gate.onGo()
    props.onSelect()
  }

  return (
    <a
      className={clsx(
        styles["screen-nav-gate"],
        gate.active && styles["is-active"],
        gate.disabled && styles["is-disabled"],
        gate.returnMark && styles["has-return-mark"],
      )}
      href={gate.href}
      aria-current={gate.active ? "page" : undefined}
      aria-disabled={gate.disabled ? true : undefined}
      title={gate.title}
      onClick={onClick}
    >
      <span className={styles["screen-nav-gate-icon"]} aria-hidden="true">
        {GATE_ICONS[gate.icon]}
      </span>
      {gate.label}
    </a>
  )
}
