// 新しい器「舞台と紙」の、舞台の右の場所。
// 働く・渡すでは、中央に紙、紙の下端に浮く入力欄、右に欄外を置く。迎えるでは紙も欄外も出さず、迎えの一言・始め方・入力欄を地の上に下寄せで並べ、入力欄は働くと同じ下端に置く。
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
  /** 欄外。`titleShown` が偽なら題は名乗り（`aria-label`）だけにし、見出しを中身の区画に任せる。 */
  readonly margin: {
    readonly title: string
    readonly titleShown: boolean
    readonly body: ReactNode
  }
  readonly dock: ReactNode
  /** 尋ねるあいだだけ渡す。入力欄の場所の上にお伺いを出し、紙の中身を引かせる。 */
  readonly inquiry?: ReactNode
}

export function PaperDesk(props: PaperDeskProps): ReactElement {
  if (props.posture === "greet") {
    return (
      <div className={styles["paper-home"]} data-region="home" data-posture="greet">
        {props.greeting}
        <main className={styles["paper-home-body"]} data-region="paper" aria-label="始め方">
          {props.paper}
        </main>
        <section className={styles["paper-home-dock"]} data-region="dock" aria-label="入力欄">
          {props.inquiry}
          {props.dock}
        </section>
      </div>
    )
  }
  const asking = props.inquiry !== undefined
  return (
    <>
      <div className={styles["paper-sheet"]}>
        <main className={styles["paper"]} data-region="paper" data-asking={asking} aria-label="紙">
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
      <aside
        className={styles["paper-margin"]}
        data-region="margin"
        aria-label={props.margin.title}
      >
        {props.margin.titleShown && (
          <h2 className={styles["paper-margin-title"]}>{props.margin.title}</h2>
        )}
        {props.margin.body}
      </aside>
    </>
  )
}
