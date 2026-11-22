// 手順の並び（番号の丸・縦の線・題・本文）を描く部品。中身は Astryx の `Stepper` と `Step`。

import { Step as AstryxStep, Stepper as AstryxStepper } from "@astryxdesign/core/Stepper"
import type { ReactElement, ReactNode } from "react"

import styles from "./stepper.module.css"

export type StepperProps = {
  /** 今の手順の番号（0 始まり）。どれも今でないときは -1。 */
  readonly activeStep: number
  /** 手順の並びの名前（読み上げ用）。 */
  readonly label: string
  /** 並べる向き。省くと縦。 */
  readonly orientation?: "horizontal" | "vertical"
  /** 行の詰め方（Astryx の既定は balanced）。 */
  readonly density: "compact" | "balanced" | "spacious"
  /** 今の段の題を太字・地の色に、済んだ段とこれからの段の題を控えめの色にするか。 */
  readonly emphasizeActive: boolean
  /** 題の字の段。standard は Astryx の既定、secondary は `--font-secondary`。 */
  readonly textSize: "standard" | "secondary"
  readonly children: ReactNode
}

export function Stepper(props: StepperProps): ReactElement {
  return (
    <AstryxStepper
      className={styles["stepper"]}
      data-emphasis={props.emphasizeActive ? "active" : "none"}
      data-text-size={props.textSize}
      density={props.density}
      activeStep={props.activeStep}
      label={props.label}
      orientation={props.orientation ?? "vertical"}
    >
      {props.children}
    </AstryxStepper>
  )
}

export type StepProps = {
  /** 0 始まりの番号。 */
  readonly step: number
  readonly label: string
  readonly children?: ReactNode
  /** 題の行の右端に置く札。 */
  readonly end?: ReactNode
  /** 済み・今・これからに関わらず、いつも番号の丸で描くか。省くと進み具合で変わる。 */
  readonly alwaysNumbered?: boolean
}

export function Step(props: StepProps): ReactElement {
  return (
    <AstryxStep
      step={props.step}
      label={props.label}
      endContent={props.end}
      indicator={props.alwaysNumbered === true ? "number" : "auto"}
    >
      {props.children}
    </AstryxStep>
  )
}
