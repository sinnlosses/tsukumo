// サイドバーの区画1つぶんの枠。中身は `.sidebar-block-scroll` で包んで内側にスクロールさせる
// （区画ごとの内側スクロールをここで共通に持たせる。`sidebar.module.css`）。
//
// **見出し（`h2`）は `title` に文字を渡した区画だけに出す。** 「セッション情報」の区画は見出しを
// 名乗らず、タスクの区画と同じ枠を借りるだけになった（`docs/design.md` 13.9「顔」・
// `docs/requirements.md` 4.2）。
//
// `action` を渡した区画は、見出しの右端に押せる口が並ぶ（タスク一覧の「一覧を見る」）。
// **見出しそのものは押せるようにしない** — 区画ごと開閉するのではなく、別の場所（モーダル）を
// 開く操作なので、押せる範囲は見出しの文字と分けておく。

import { type ReactElement, type ReactNode } from "react"

import styles from "./sidebar.module.css"

export type SidebarSectionAction = {
  readonly label: string
  readonly onAction: () => void
}

export type SidebarSectionProps = {
  /** 見出しの文字。**`undefined` なら見出しごと出さない**（`action` も一緒には出せない）。 */
  readonly title: string | undefined
  /** 区画ごとの高さの取り方を足す class 名（`sidebar.module.css` のもの）。呼び出し側が渡す。 */
  readonly extraClass: string
  readonly action: SidebarSectionAction | undefined
  readonly children: ReactNode
}

export function SidebarSection(props: SidebarSectionProps): ReactElement {
  return (
    <section className={`${styles["sidebar-block"]} ${props.extraClass}`}>
      {props.title === undefined ? null : (
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
      )}
      <div className={styles["sidebar-block-scroll"]}>{props.children}</div>
    </section>
  )
}
