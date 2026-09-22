// サイドバー本体。「補足情報の置き場」であって単機能パネルではないので、独立した3つの区画
// （いま何をしているか・タスク一覧・セッション情報）を並べる
// （docs/design.md 6.1「部品の木」）。
//
// **3つの区画は互いに独立している。** どれか1つの中身が空・不明でも、残りは表示を続ける
// （`Activity` / `TaskList` / `SessionInfo` がそれぞれ自分の分だけ見る）。
//
// **タスク一覧の表（`TaskBoard`）を開いているかどうかだけはここが持つ。** 開く口は
// タスク一覧の区画の見出しにあり、開いた先は画面いっぱいのモーダルなので、区画の中ではなく
// サイドバーの直下に置く。

import { type ReactElement, useState } from "react"

import { useSessionSelector } from "../../stores/session.tsx"
import { Activity } from "./activity.tsx"
import { SidebarSection } from "./section.tsx"
import { SessionInfo } from "./session-info.tsx"
import styles from "./sidebar.module.css"
import { TaskBoard } from "./task-board.tsx"
import { TaskList, taskListTitle } from "./task-list.tsx"

export function Sidebar(): ReactElement {
  const runningTools = useSessionSelector((session) => session.state.runningTools)
  const finishedTools = useSessionSelector((session) => session.state.finishedTools)
  const tasks = useSessionSelector((session) => session.state.tasks)
  const [boardOpen, setBoardOpen] = useState(false)

  return (
    <>
      <SidebarSection
        title="いま何をしているか"
        extraClass={styles["sidebar-block-activity"] ?? ""}
        action={undefined}
      >
        <Activity running={runningTools} finished={finishedTools} />
      </SidebarSection>
      <SidebarSection
        title={taskListTitle(tasks)}
        extraClass={styles["sidebar-block-tasks"] ?? ""}
        action={{
          label: "一覧を見る",
          onAction: () => {
            setBoardOpen(true)
          },
        }}
      >
        <TaskList tasks={tasks} />
      </SidebarSection>
      <SidebarSection
        title="セッション情報"
        extraClass={styles["sidebar-block-session"] ?? ""}
        action={undefined}
      >
        <SessionInfo />
      </SidebarSection>
      <TaskBoard
        tasks={tasks}
        open={boardOpen}
        onClose={() => {
          setBoardOpen(false)
        }}
      />
    </>
  )
}
