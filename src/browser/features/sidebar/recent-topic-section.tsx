// 雑談中のサイドバーの2段目「最近の話題」（docs/design.md 13.7「雑談のときのサイドバー」）。
// **いまは見出しと空のときの案内だけ**で、並べる中身（雑談の要約に書かせる話題の見出し）は
// まだ届いていない。区画の枠（`SidebarSection`）はタスクの区画と同じものを借りる。

import { type ReactElement } from "react"

import { SidebarSection } from "./section.tsx"
import styles from "./sidebar.module.css"

export function RecentTopicSection(): ReactElement {
  return (
    <SidebarSection
      title="最近の話題"
      extraClass={styles["sidebar-block-chat"] ?? ""}
      action={undefined}
    >
      <p className={styles["sidebar-empty"]}>まだ話題が無い</p>
    </SidebarSection>
  )
}
