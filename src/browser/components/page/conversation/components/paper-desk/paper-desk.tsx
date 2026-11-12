// 新しい器「舞台と紙」の、舞台の右の場所。中央に紙、紙の下端に浮く入力欄、右に欄外を置く。
// 場所は `data-region` でも名乗る（class 名はハッシュ化されるので、外から場所を指す口はこちらを使う）。
// ここから他の機能を import しない（中身は props で受ける）。

import type { ReactElement, ReactNode } from "react"

import styles from "./paper-desk.module.css"

type PaperDeskProps = {
  readonly paper: ReactNode
  readonly margin: { readonly title: string; readonly body: ReactNode }
  readonly dock: ReactNode
}

export function PaperDesk(props: PaperDeskProps): ReactElement {
  return (
    <>
      <div className={styles["paper-sheet"]}>
        <main className={styles["paper"]} data-region="paper" aria-label="紙">
          {props.paper}
        </main>
        <section className={styles["paper-dock"]} data-region="dock" aria-label="入力欄">
          {props.dock}
        </section>
      </div>
      <aside
        className={styles["paper-margin"]}
        data-region="margin"
        aria-label={props.margin.title}
      >
        <h2 className={styles["paper-margin-title"]}>{props.margin.title}</h2>
        {props.margin.body}
      </aside>
    </>
  )
}
