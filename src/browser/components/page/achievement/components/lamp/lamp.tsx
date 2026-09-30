// 灯りの段階の狐火。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { LampLevel } from "../../../../../../shared/achievement/achievement-calendar.ts"
import styles from "./lamp.module.css"

/** 段階ごとの見た目の大きさ（見本の px 値）。段階が上がるほど大きく・強く光らせる。 */
const LAMP_SIZE_PX = {
  none: 22,
  faint: 18,
  lit: 20,
  bright: 23,
} as const satisfies Record<LampLevel, number>

const FLAME_PATH =
  "M12 2.5c1.6 3.7 5.5 5.6 5.5 10.6a5.5 5.5 0 0 1-11 0c0-2.7 1.4-4.2 2.6-5.6.2 1.4 1 2.3 2 2.6-.4-2.8.3-5.3.9-7.6z"

export function Lamp(props: { readonly level: LampLevel }): ReactElement {
  const size = LAMP_SIZE_PX[props.level]
  if (props.level === "none") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path d={FLAME_PATH} fill="none" stroke="var(--rule)" strokeWidth="1.2" />
      </svg>
    )
  }
  const opacity = props.level === "faint" ? 0.32 : props.level === "lit" ? 0.66 : 1
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={clsx(
        props.level === "lit" && styles["achievement-calendar-lamp-lit"],
        props.level === "bright" && styles["achievement-calendar-lamp-bright"],
      )}
    >
      <path d={FLAME_PATH} fill="var(--accent)" fillOpacity={opacity} />
      {props.level === "bright" && (
        <path
          d="M12 11c.9 1.6 2.3 2.4 2.3 4.2a2.3 2.3 0 0 1-4.6 0c0-1.3.9-2.4 2.3-4.2z"
          fill="var(--ground)"
          opacity="0.85"
        />
      )}
    </svg>
  )
}
