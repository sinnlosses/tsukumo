// サイドバー本体。「補足情報の置き場」であって単機能パネルではないので、独立した3つの区画
// （いま何をしているか・タスク一覧・セッション情報）を並べる
// （docs/design.md 6.1「部品の木」）。
//
// **3つの区画は互いに独立している。** どれか1つの中身が空・不明でも、残りは表示を続ける
// （`Activity` / まん中の区画 / `SessionInfo` がそれぞれ自分の分だけ見る）。
//
// **まん中の区画（タスク一覧）は `task-section.tsx` にひとまとめにしてある。** 区画の枠は
// ここが持ち、中身は置かれる機能（`features/task-board/`）から借りる
// （docs/design.md 2章「領域の機能と、置かれる機能」）。

import { type ReactElement } from "react"

import { useSessionSelector } from "../../stores/session.tsx"
import { Activity } from "./activity.tsx"
import { SidebarSection } from "./section.tsx"
import { SessionInfo } from "./session-info.tsx"
import styles from "./sidebar.module.css"
import { TaskSection } from "./task-section.tsx"

export function Sidebar(): ReactElement {
  const runningTools = useSessionSelector((session) => session.state.runningTools)
  const finishedTools = useSessionSelector((session) => session.state.finishedTools)

  return (
    <>
      <SidebarSection
        title="いま何をしているか"
        extraClass={styles["sidebar-block-activity"] ?? ""}
        action={undefined}
      >
        <Activity running={runningTools} finished={finishedTools} />
      </SidebarSection>
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
