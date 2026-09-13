// サイドバー本体。「補足情報の置き場」であって単機能パネルではないので、独立した3つの区画
// （いま何をしているか・タスク一覧・セッション情報）を並べる（2026-09-11 決定。
// docs/design.md 6.1「部品の木」）。
//
// **3つの区画は互いに独立している。** どれか1つの中身が空・不明でも、残りは表示を続ける
// （`Activity` / `TaskList` / `SessionInfo` がそれぞれ自分の分だけ見る）。

import { type ReactElement } from "react"

import { useSession } from "../app.tsx"
import { Activity } from "./activity.tsx"
import { SidebarSection } from "./section.tsx"
import { SessionInfo } from "./session-info.tsx"
import { TaskList, taskListTitle } from "./task-list.tsx"

export function Sidebar(): ReactElement {
  const { state } = useSession()

  return (
    <>
      <SidebarSection title="いま何をしているか" extraClass="sidebar-block-activity">
        <Activity running={state.runningTools} finished={state.finishedTools} />
      </SidebarSection>
      <SidebarSection title={taskListTitle(state.tasks)} extraClass="sidebar-block-tasks">
        <TaskList tasks={state.tasks} />
      </SidebarSection>
      <SidebarSection title="セッション情報" extraClass="sidebar-block-session">
        <SessionInfo />
      </SidebarSection>
    </>
  )
}
