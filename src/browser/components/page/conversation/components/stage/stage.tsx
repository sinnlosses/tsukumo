// 新しい器「舞台と紙」の外枠。背景を画面の全面に敷き、左に舞台（立ち絵の場所）、右に紙の場所を置く。
// 背景の画像は `usePackAppearance` が `<html>` に差す `--character-background-image` を読む。
// 場所は `data-region` でも名乗る（class 名はハッシュ化されるので、外から場所を指す口はこちらを使う）。

import type { ReactElement, ReactNode } from "react"

import styles from "./stage.module.css"

/** 器の姿勢。迎えるは舞台を広げ、働くと渡すは舞台を絞って紙を出す。 */
export type StagePosture = "greet" | "work" | "deliver"

type StageProps = {
  readonly posture: StagePosture
  /** 雑談中か。雑談では舞台を画面の 40% に広げる。 */
  readonly chatMode: boolean
  /** 舞台に立たせるもの（立ち絵と吹き出し）。 */
  readonly figure: ReactNode
  /** 舞台の右の場所に置くもの（紙・欄外・浮く入力欄）。 */
  readonly desk: ReactNode
}

export function Stage(props: StageProps): ReactElement {
  return (
    <div
      className={styles["stage-shell"]}
      data-posture={props.posture}
      data-chat={props.chatMode ? "" : undefined}
    >
      <div className={styles["stage-scene"]} aria-hidden="true" />
      <section className={styles["stage-figure"]} data-region="stage" aria-label="キャラクター">
        {props.figure}
      </section>
      <div className={styles["stage-desk"]}>{props.desk}</div>
    </div>
  )
}
