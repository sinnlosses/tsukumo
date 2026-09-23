// 雑談中のサイドバーの3段目「覚えていること」（docs/design.md 13.7「雑談のときのサイドバー」）。
// 中身は `persona.md` の `## 覚えたこと`（`docs/glossary.md`「覚えたこと」）。**いまは見出しと
// 空のときの案内だけ**で、行はまだ届いていない。見出しの右端の「編集」は**消せる行があるときだけ**
// 置く（空のときに押せても何もできない）ので、いまは置かない。

import { type ReactElement } from "react"

import { SidebarSection } from "./section.tsx"
import styles from "./sidebar.module.css"

export function PersonaMemorySection(): ReactElement {
  return (
    <SidebarSection
      title="覚えていること"
      extraClass={styles["sidebar-block-chat"] ?? ""}
      action={undefined}
    >
      <p className={styles["sidebar-empty"]}>まだ覚えていることが無い</p>
    </SidebarSection>
  )
}
