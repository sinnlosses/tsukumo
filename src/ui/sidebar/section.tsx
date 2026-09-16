// サイドバーの区画1つぶんの枠。見出し（`h2`）は固定し、中身だけ `.sidebar-block-scroll` で
// 包んで内側にスクロールさせる（3区画それぞれの内側スクロールをここで共通に持たせる。
// `src/ui/style/sidebar.css`）。
//
// `toggle` を渡した区画は見出しが押せるようになる（畳んで開く区画）。開閉の状態は
// **印（▸ / ▾）と文字（「開く」/「畳む」）と `aria-expanded` の3つ**で出す
// （色や印だけで意味を伝えない。docs/requirements.md 4.2）。

import { type ReactElement, type ReactNode } from "react"

export type SidebarSectionToggle = {
  readonly expanded: boolean
  readonly onToggle: () => void
}

export type SidebarSectionProps = {
  readonly title: string
  readonly extraClass: string
  readonly toggle: SidebarSectionToggle | undefined
  readonly children: ReactNode
}

export function SidebarSection(props: SidebarSectionProps): ReactElement {
  return (
    <section className={`sidebar-block ${props.extraClass}`}>
      <h2>
        {props.toggle === undefined ? (
          props.title
        ) : (
          <SectionToggle title={props.title} toggle={props.toggle} />
        )}
      </h2>
      <div className="sidebar-block-scroll">{props.children}</div>
    </section>
  )
}

function SectionToggle(props: {
  readonly title: string
  readonly toggle: SidebarSectionToggle
}): ReactElement {
  return (
    <button
      type="button"
      className="sidebar-block-toggle"
      aria-expanded={props.toggle.expanded}
      onClick={props.toggle.onToggle}
    >
      <span aria-hidden="true">{props.toggle.expanded ? "▾" : "▸"}</span>
      <span className="sidebar-block-toggle-title">{props.title}</span>
      <span className="sidebar-block-toggle-hint">{props.toggle.expanded ? "畳む" : "開く"}</span>
    </button>
  )
}
