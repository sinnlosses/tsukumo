// 手順の並び（番号の丸・縦の線・題・本文）を描く部品。中身は Astryx の `Stepper` と `Step`。

import { Step as AstryxStep, Stepper as AstryxStepper } from "@astryxdesign/core/Stepper"
import type { ReactElement, ReactNode } from "react"

import styles from "./stepper.module.css"

/**
 * 並びが進み具合を持つか。
 * progress は今の段まで線と番号に色を付ける。sequence は進み具合の無い順番の並びで、
 * 番号を1本の線の上に置き、どの段の題も地の色で描く。
 */
export type StepperProgress =
  | {
      readonly kind: "progress"
      /** 今の手順の番号（0 始まり）。どれも今でないときは -1。 */
      readonly activeStep: number
      /** 今の段の題を太字・地の色に、済んだ段とこれからの段の題を控えめの色にするか。 */
      readonly emphasizeActive: boolean
    }
  | { readonly kind: "sequence" }

export type StepperProps = {
  readonly progress: StepperProgress
  /** 手順の並びの名前（読み上げ用）。 */
  readonly label: string
  /** 並べる向き。省くと縦。 */
  readonly orientation?: "horizontal" | "vertical"
  /** 行の詰め方（Astryx の既定は balanced）。 */
  readonly density: "compact" | "balanced" | "spacious"
  /** 題の字の段。standard は Astryx の既定、secondary は `--font-secondary`。 */
  readonly textSize: "standard" | "secondary"
  readonly children: ReactNode
}

export function Stepper(props: StepperProps): ReactElement {
  const { progress } = props
  return (
    <AstryxStepper
      className={styles["stepper"]}
      data-emphasis={emphasisOf(progress)}
      data-text-size={props.textSize}
      density={props.density}
      activeStep={progress.kind === "progress" ? progress.activeStep : -1}
      indicatorPosition={progress.kind === "sequence" ? "on-track" : "separated"}
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

function emphasisOf(progress: StepperProgress): "active" | "none" | "sequence" {
  if (progress.kind === "sequence") {
    return "sequence"
  }
  return progress.emphasizeActive ? "active" : "none"
}
