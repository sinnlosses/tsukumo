// サイドバーの区画1つぶんの枠。見出し（`h2`）は固定し、中身だけ `.sidebar-block-scroll` で
// 包んで内側にスクロールさせる（3区画それぞれの内側スクロールをここで共通に持たせる。
// `sidebar.module.css`）。
//
// `action` を渡した区画は、見出しの右端に押せる口が並ぶ（タスク一覧の「一覧を見る」）。
// **見出しそのものは押せるようにしない** — 区画ごと開閉するのではなく、別の場所（モーダル）を
// 開く操作なので、押せる範囲は見出しの文字と分けておく。
//
// **まん中の区画は、枠だけをここが持ち、中身は置かれる機能が描く**（`SidebarTaskFrame`。
// docs/design.md 2章「領域の機能と、置かれる機能」）。

import { type ReactElement, type ReactNode } from "react"

import styles from "./sidebar.module.css"

export type SidebarSectionAction = {
  readonly label: string
  readonly onAction: () => void
}

export type SidebarSectionProps = {
  readonly title: string
  /** 区画ごとの高さの取り方を足す class 名（`sidebar.module.css` のもの）。呼び出し側が渡す。 */
  readonly extraClass: string
  readonly action: SidebarSectionAction | undefined
  readonly children: ReactNode
}

export function SidebarSection(props: SidebarSectionProps): ReactElement {
  return (
    <section className={`${styles["sidebar-block"]} ${props.extraClass}`}>
      <h2>
        <span className={styles["sidebar-block-title"]}>{props.title}</span>
        {props.action === undefined ? null : (
          <button
            type="button"
            className={styles["sidebar-block-action"]}
            aria-haspopup="dialog"
            onClick={props.action.onAction}
          >
            {props.action.label}
          </button>
        )}
      </h2>
      <div className={styles["sidebar-block-scroll"]}>{props.children}</div>
    </section>
  )
}

/**
 * まん中の区画（タスク一覧）の枠。**高さの取り方（区画どうしの割り当て）だけをサイドバーが
 * 決め**、見出しの文言・中身・押せる口は置かれる機能が決める（docs/design.md 2章）。
 * `main.tsx` が置かれる機能へ渡す（サイドバーの側からは中身を import しない）。
 */
export function SidebarTaskFrame(props: {
  readonly title: string
  readonly action: SidebarSectionAction
  readonly children: ReactNode
}): ReactElement {
  return (
    <SidebarSection
      title={props.title}
      extraClass={styles["sidebar-block-tasks"] ?? ""}
      action={props.action}
    >
      {props.children}
    </SidebarSection>
  )
}
