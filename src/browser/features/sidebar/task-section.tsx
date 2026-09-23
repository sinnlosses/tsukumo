// サイドバーのまん中の区画（タスク一覧）ひとまとまり。**区画の枠（`SidebarSection`）はサイドバーが
// 持ち**、中身の一覧と、見出しの「一覧を見る」から開く画面いっぱいの表は置かれる機能
// （`features/task-board/`）から借りる（docs/design.md 2章「領域の機能と、置かれる機能」）。
//
// **タスクの購読と、表を開いているかどうか・チップで絞っているかどうかの state はここが持つ。**
// `main.tsx` の `<Root>` へ上げると木の頂点がタスクを購読することになり、タスクが変わるたびに
// 全領域が描き直される。
//
// **絞り込みは1つだけ選べ、同じチップをもう一度押すと全件に戻る**（経緯は
// docs/display.md 4.2）。`boardOpen` と同じく表示上の状態なので保存しない
// （セッションの間だけ保つ。リロードやセッションの起こし直しで全件に戻る）。**絞っている
// 最中にタスクが変わって0件になっても選択は外さない**——「◯◯のタスクが無い」の一言は
// `TaskList` が出す。

import { useState, type ReactElement } from "react"

import { useSessionSelector } from "../../stores/session.tsx"
import { TaskCountChipList } from "../task-board/components/task-count-chip-list.tsx"
import { taskListCounts, type TaskListFilterStatus } from "../task-board/domain/task-list-count.ts"
import { TaskBoard } from "../task-board/task-board.tsx"
import { TaskList } from "../task-board/task-list.tsx"
import { SidebarSection } from "./section.tsx"
import styles from "./sidebar.module.css"

export function TaskSection(): ReactElement {
  const tasks = useSessionSelector((session) => session.state.tasks)
  const [boardOpen, setBoardOpen] = useState(false)
  const [selectedStatus, setSelectedStatus] = useState<TaskListFilterStatus | undefined>(undefined)

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
          <TaskCountChipList
            counts={taskListCounts(tasks.items)}
            selected={selectedStatus}
            onSelect={(status) => {
              setSelectedStatus((current) => (current === status ? undefined : status))
            }}
          />
        )}
        <TaskList tasks={tasks} selectedStatus={selectedStatus} />
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
