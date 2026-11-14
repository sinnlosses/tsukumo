// 新しい器「舞台と紙」の、舞台の右の場所。
// どの姿勢でも、中央に紙、紙の下端に浮く入力欄、右端にサイドバーを置く。迎えるでは紙の先頭に迎えの一言を置き、始め方を紙に出す。
// 場所は `data-region` でも名乗る（class 名はハッシュ化されるので、外から場所を指す口はこちらを使う）。
// ここから他の機能を import しない（中身は props で受ける）。

import type { ReactElement, ReactNode } from "react"

import type { StagePosture } from "../stage/stage.tsx"
import styles from "./paper-desk.module.css"

type PaperDeskProps = {
  readonly posture: StagePosture
  /** 迎えるでだけ、入力欄の上に出す迎えの一言。 */
  readonly greeting: ReactNode
  readonly paper: ReactNode
  /** 紙の右（3列目）に置くサイドバー。 */
  readonly sidebar: ReactNode
  readonly dock: ReactNode
  /** 尋ねるあいだだけ渡す。入力欄の場所の上にお伺いを出し、紙の中身を引かせる。 */
  readonly inquiry?: ReactNode
}

export function PaperDesk(props: PaperDeskProps): ReactElement {
  const asking = props.inquiry !== undefined
  return (
    <>
      <div className={styles["paper-sheet"]}>
        <main className={styles["paper"]} data-region="paper" data-asking={asking} aria-label="紙">
          {props.greeting}
          {props.paper}
        </main>
        <section
          className={styles["paper-dock"]}
          data-region="dock"
          data-posture={asking ? "ask" : props.posture}
          aria-label="入力欄"
        >
          {props.inquiry}
          {props.dock}
        </section>
      </div>
      <div className={styles["paper-sidebar"]}>{props.sidebar}</div>
    </>
  )
}

type PaperMarginProps = {
  readonly title: string
  readonly body: ReactNode
}

/** 雑談のサイドバーの中段。題は名乗り（`aria-label`）だけにし、見出しは中身の区画に任せる。 */
export function PaperMargin(props: PaperMarginProps): ReactElement {
  return (
    <section className={styles["paper-margin"]} aria-label={props.title}>
      {props.body}
    </section>
  )
}
