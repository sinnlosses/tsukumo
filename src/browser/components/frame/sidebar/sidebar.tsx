// 会話の画面の右端に常設するサイドバーの枠。上から検索の入口（search）・中段（body）・下の入口の行（foot）を並べる。
// 場所は `data-region="sidebar"` でも名乗る（class 名はハッシュ化されるので、外から場所を指す口はこちらを使う）。
// 中身は props で受け、ストアを読まない。転がるのは中段だけ。

import type { ReactElement, ReactNode } from "react"

import styles from "./sidebar.module.css"

type SidebarProps = {
  readonly search: ReactNode
  readonly body: ReactNode
  readonly foot: ReactNode
}

export function Sidebar(props: SidebarProps): ReactElement {
  return (
    <aside className={styles["sidebar"]} data-region="sidebar" aria-label="サイドバー">
      <div className={styles["sidebar-search"]}>{props.search}</div>
      <div className={styles["sidebar-body"]}>{props.body}</div>
      <div className={styles["sidebar-foot"]}>{props.foot}</div>
    </aside>
  )
}
