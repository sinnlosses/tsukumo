// 狐火。暦の灯りの段階と、進み具合の段の印の状態を、同じ炎の形で描き分ける。

import clsx from "clsx"
import type { ReactElement } from "react"

import styles from "./lamp.module.css"

export type LampLevel = "none" | "faint" | "lit" | "bright"

export type LampStepState = "done" | "now" | "todo" | "skipped" | "fail"

export type LampProps =
  | { readonly kind: "level"; readonly level: LampLevel }
  | { readonly kind: "step"; readonly state: LampStepState; readonly sizePx: number }

/** 段階ごとの見た目の大きさ（見本の px 値）。段階が上がるほど大きく・強く光らせる。 */
const LAMP_SIZE_PX = {
  none: 22,
  faint: 18,
  lit: 20,
  bright: 23,
} as const satisfies Record<LampLevel, number>

const FLAME_PATH =
  "M12 2.5c1.6 3.7 5.5 5.6 5.5 10.6a5.5 5.5 0 0 1-11 0c0-2.7 1.4-4.2 2.6-5.6.2 1.4 1 2.3 2 2.6-.4-2.8.3-5.3.9-7.6z"

const CORE_PATH = "M12 11c.9 1.6 2.3 2.4 2.3 4.2a2.3 2.3 0 0 1-4.6 0c0-1.3.9-2.4 2.3-4.2z"

/** 段の印の並びで、今の段だけを大きくする（見本の値）。 */
const ROW_LAMP_SIZE_PX = { now: 20, other: 15 } as const

export function Lamp(props: LampProps): ReactElement {
  return props.kind === "level" ? <LevelLamp level={props.level} /> : <StepLamp {...props} />
}

/** 段の印の並び。読み上げは並び全体を `label` の1つの画像として読む。 */
export function LampRow(props: {
  readonly lamps: readonly { readonly key: string; readonly state: LampStepState }[]
  readonly label: string
}): ReactElement {
  return (
    <span className={styles["lamp-row"]} role="img" aria-label={props.label}>
      {props.lamps.map((lamp) => (
        <StepLamp
          key={lamp.key}
          state={lamp.state}
          sizePx={lamp.state === "now" ? ROW_LAMP_SIZE_PX.now : ROW_LAMP_SIZE_PX.other}
        />
      ))}
    </span>
  )
}

function LevelLamp(props: { readonly level: LampLevel }): ReactElement {
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
      {props.level === "bright" && <path d={CORE_PATH} fill="var(--ground)" opacity="0.85" />}
    </svg>
  )
}

function StepLamp(props: { readonly state: LampStepState; readonly sizePx: number }): ReactElement {
  if (props.state === "fail") {
    return (
      <svg
        width={props.sizePx}
        height={props.sizePx}
        viewBox="0 0 24 24"
        aria-hidden="true"
        data-lamp-state="fail"
      >
        <path
          d="M6 6l12 12M18 6L6 18"
          fill="none"
          stroke="var(--state-ng)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  const outlined = props.state === "todo" || props.state === "skipped"
  return (
    <svg
      width={props.sizePx}
      height={props.sizePx}
      viewBox="0 0 24 24"
      aria-hidden="true"
      data-lamp-state={props.state}
      className={clsx(props.state === "now" && styles["lamp-step-now"])}
    >
      {outlined ? (
        <path
          d={FLAME_PATH}
          fill="none"
          stroke="var(--ink-quiet)"
          strokeWidth="1.3"
          strokeDasharray={props.state === "skipped" ? "2 2.4" : undefined}
        />
      ) : (
        <path d={FLAME_PATH} fill="var(--accent)" fillOpacity={props.state === "done" ? 0.72 : 1} />
      )}
      {props.state === "now" && <path d={CORE_PATH} fill="var(--ground)" opacity="0.85" />}
    </svg>
  )
}
