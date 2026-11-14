// 新しい器「舞台と紙」の外枠。背景を画面の全面に敷き、左に舞台（立ち絵の場所）、右に紙の場所を置く。
// 背景の画像は `usePackAppearance` が `<html>` に差す `--character-background-image` を読む。
// 場所は `data-region` でも名乗る（class 名はハッシュ化されるので、外から場所を指す口はこちらを使う）。
//
// ほかの画面の紙が重なっているあいだ、紙の場所は `inert` にして覆いを敷く。舞台と部屋の頭は操作できるまま残す。
// 覆いは `inert` の外（紙の場所の兄弟）に置かないと押せない。

import type { ReactElement, ReactNode } from "react"

import styles from "./stage.module.css"

/** 器の姿勢。どの姿勢も舞台・紙・サイドバーの3列で、舞台と紙の中身が変わる。 */
export type StagePosture = "greet" | "work" | "deliver"

type StageProps = {
  readonly posture: StagePosture
  /** 雑談中か。雑談では舞台を画面の 40% に広げる。 */
  readonly chatMode: boolean
  /** ほかの画面の紙が重なっているか。 */
  readonly covered: boolean
  /** 覆いを押したとき（紙を閉じる）。 */
  readonly onUncover: () => void
  /** 狭い幅で縦1列の先頭に置く1行の頭。広い幅では中身の側が隠す。 */
  readonly narrowHead: ReactNode
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
      <div className={styles["stage-narrow-head"]}>{props.narrowHead}</div>
      <section className={styles["stage-figure"]} data-region="stage" aria-label="キャラクター">
        {props.figure}
      </section>
      <div className={styles["stage-desk"]} inert={props.covered}>
        {props.desk}
      </div>
      {props.covered && (
        // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- キーでは紙の Esc で閉じる
        <div className={styles["stage-veil"]} aria-hidden="true" onClick={props.onUncover} />
      )}
    </div>
  )
}
