// サイドバーの区画1つぶんの枠。見出し（`h2`）は固定し、中身だけ `.sidebar-block-scroll` で
// 包んで内側にスクロールさせる（3区画それぞれの内側スクロールをここで共通に持たせる。
// 旧の `src/presentation/view.ts` の `sidebarSection` と同じ形。`src/ui/style/sidebar.css`）。

import { type ReactElement, type ReactNode } from "react"

export type SidebarSectionProps = {
  readonly title: string
  readonly extraClass: string
  readonly children: ReactNode
}

export function SidebarSection(props: SidebarSectionProps): ReactElement {
  return (
    <section className={`sidebar-block ${props.extraClass}`}>
      <h2>{props.title}</h2>
      <div className="sidebar-block-scroll">{props.children}</div>
    </section>
  )
}
