// サイドバー本体。「補足情報の置き場」であって単機能パネルではないので、独立した2つの区画
// （タスク一覧・セッション情報）を並べる（docs/design.md 6.1「部品の木」）。**「いま何をしているか」
// の区画は帯の「いまの作業」へ移した**（`src/browser/features/screen-nav/`。docs/design.md 13.9）。
//
// **2つの区画は互いに独立している。** どちらかの中身が空・不明でも、残りは表示を続ける
// （まん中の区画 / `SessionInfo` がそれぞれ自分の分だけ見る）。
//
// **まん中の区画（タスク一覧）は `task-section.tsx` にひとまとめにしてある。** 区画の枠は
// ここが持ち、中身は置かれる機能（`features/task-board/`）から借りる
// （docs/design.md 2章「領域の機能と、置かれる機能」）。

import { type ReactElement } from "react"

import { SidebarSection } from "./section.tsx"
import { SessionInfo } from "./session-info.tsx"
import styles from "./sidebar.module.css"
import { TaskSection } from "./task-section.tsx"

export function Sidebar(): ReactElement {
  return (
    <>
      <TaskSection />
      <SidebarSection
        title="セッション情報"
        extraClass={styles["sidebar-block-session"] ?? ""}
        action={undefined}
      >
        <SessionInfo />
      </SidebarSection>
    </>
  )
}
