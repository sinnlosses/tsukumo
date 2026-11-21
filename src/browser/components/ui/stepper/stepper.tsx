// 手順の並び（番号の丸・縦の線・題・本文）を描く部品。中身は Astryx の `Stepper` と `Step`。

import { Step as AstryxStep, Stepper as AstryxStepper } from "@astryxdesign/core/Stepper"
import type { ReactElement, ReactNode } from "react"

export type StepperProps = {
  /** 今の手順の番号（0 始まり）。どれも今でないときは -1。 */
  readonly activeStep: number
  /** 手順の並びの名前（読み上げ用）。 */
  readonly label: string
  /** 並べる向き。省くと縦。 */
  readonly orientation?: "horizontal" | "vertical"
  readonly children: ReactNode
}

export function Stepper(props: StepperProps): ReactElement {
  return (
    <AstryxStepper
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
