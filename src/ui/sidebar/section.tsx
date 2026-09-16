// サイドバーの区画1つぶんの枠。見出し（`h2`）は固定し、中身だけ `.sidebar-block-scroll` で
// 包んで内側にスクロールさせる（3区画それぞれの内側スクロールをここで共通に持たせる。
// `src/ui/style/sidebar.css`）。
//
// `action` を渡した区画は、見出しの右端に押せる口が並ぶ（タスク一覧の「一覧を見る」）。
// **見出しそのものは押せるようにしない** — 区画ごと開閉するのではなく、別の場所（モーダル）を
// 開く操作なので、押せる範囲は見出しの文字と分けておく。

import { type ReactElement, type ReactNode } from "react"

export type SidebarSectionAction = {
  readonly label: string
  readonly onAction: () => void
}

export type SidebarSectionProps = {
  readonly title: string
  readonly extraClass: string
  readonly action: SidebarSectionAction | undefined
  readonly children: ReactNode
}

export function SidebarSection(props: SidebarSectionProps): ReactElement {
  return (
    <section className={`sidebar-block ${props.extraClass}`}>
      <h2>
        <span className="sidebar-block-title">{props.title}</span>
        {props.action === undefined ? null : (
          <button
            type="button"
            className="sidebar-block-action"
            aria-haspopup="dialog"
            onClick={props.action.onAction}
          >
            {props.action.label}
          </button>
        )}
      </h2>
      <div className="sidebar-block-scroll">{props.children}</div>
    </section>
  )
}
