// サイドバーの区画1つぶんの枠。見出し（`h2`）は固定し、中身だけ `.sidebar-block-scroll` で
// 包んで内側にスクロールさせる（区画ごとの内側スクロールをここで共通に持たせる。
// `sidebar.module.css`）。
//
// **見出しを名乗らないものはここを通さない。** 下端のセッション情報は区画ではなく帯
// （`sidebar.tsx` の `.sidebar-footer`）で、枠も余白もスクロールも別に持つ。
//
// `action` を渡した区画は、見出しの右端に押せる口が並ぶ（タスク一覧の「一覧を見る」）。
// **見出しそのものは押せるようにしない** — 区画ごと開閉するのではなく、別の場所（モーダル）を
// 開く操作なので、押せる範囲は見出しの文字と分けておく。

import { type ReactElement, type ReactNode } from "react"

import { Heading } from "../../../components/ui/heading/heading.tsx"
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
      <Heading
        level={2}
        size="subheading"
        tone="ink"
        weight="bold"
        className={styles["sidebar-block-heading"] ?? ""}
      >
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
      </Heading>
      <div className={styles["sidebar-block-scroll"]}>{props.children}</div>
    </section>
  )
}
