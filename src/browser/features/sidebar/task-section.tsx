// サイドバーのまん中の区画（タスク一覧）ひとまとまり。**区画の枠（`SidebarSection`）はサイドバーが
// 持ち**、中身の一覧と、見出しの「一覧を見る」から開く画面いっぱいの表は置かれる機能
// （`features/task-board/`）から借りる（docs/design.md 2章「領域の機能と、置かれる機能」）。
//
// **タスクの購読と、表を開いているかどうかの state はここが持つ。** `main.tsx` の `<Root>` へ
// 上げると木の頂点がタスクを購読することになり、タスクが変わるたびに全領域が描き直される。

import { useState, type ReactElement } from "react"

import { useSessionSelector } from "../../stores/session.tsx"
import { TaskCountChipList } from "../task-board/components/task-count-chip-list.tsx"
import { taskListCounts } from "../task-board/domain/task-list-count.ts"
import { TaskBoard } from "../task-board/task-board.tsx"
import { TaskList } from "../task-board/task-list.tsx"
import { SidebarSection } from "./section.tsx"
import styles from "./sidebar.module.css"

export function TaskSection(): ReactElement {
  const tasks = useSessionSelector((session) => session.state.tasks)
  const [boardOpen, setBoardOpen] = useState(false)

  return (
    <>
      <SidebarSection
        title="タスク"
        extraClass={styles["sidebar-block-tasks"] ?? ""}
        action={{
          label: "一覧を見る",
          onAction: () => {
            setBoardOpen(true)
          },
        }}
      >
        {tasks.kind === "unknown" ? null : (
          <TaskCountChipList counts={taskListCounts(tasks.items)} />
        )}
        <TaskList tasks={tasks} />
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
