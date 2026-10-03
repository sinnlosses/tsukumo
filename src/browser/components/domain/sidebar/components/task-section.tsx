// サイドバーのまん中の区画（タスク一覧）ひとまとまり。
// 区画の枠（`SidebarSection`）はサイドバーが持ち、中身の一覧はタスク一覧の機能から借りる。
// 見出しの「一覧を見る」はタスクのモーダルを開くよう頼むだけで、モーダルそのものは会話の画面が置く（`useTaskBoardRequest`）。
//
// タスクの購読と、チップで絞っているかどうかの state はここが持つ。
// `<Layout>` へ上げると木の頂点がタスクを購読することになり、タスクが変わるたびに全領域が描き直される。
//
// 絞り込みは1つだけ選べ、同じチップをもう一度押すと全件に戻る。
// 表示上の状態なので保存しない（リロードやセッションの起こし直しで全件に戻る）。
// 絞っている最中にタスクが変わって0件になっても選択は外さない（「◯◯のタスクが無い」の一言は `TaskList` が出す）。

import { useState, type ReactElement } from "react"

import { TaskCountChipList } from "../../../../features/task-board/components/task-count-chip-list.tsx"
import {
  taskListCounts,
  type TaskListFilterStatus,
} from "../../../../features/task-board/domain/task-list-count.ts"
import { TaskList } from "../../../../features/task-board/task-list.tsx"
import { useSession } from "../../../../stores/session.ts"
import { useTaskBoardRequest } from "../../../../stores/task-board-request.ts"
import { SidebarSection } from "./section.tsx"
import styles from "./task-section.module.css"

export function TaskSection(): ReactElement {
  const tasks = useSession((session) => session.state.tasks)
  const openList = useTaskBoardRequest((state) => state.openList)
  const [selectedStatus, setSelectedStatus] = useState<TaskListFilterStatus | undefined>(undefined)

  return (
    <SidebarSection
      title="タスク"
      extraClass={styles["sidebar-block-tasks"]}
      action={{ label: "一覧を見る", onAction: openList }}
    >
      {tasks.kind === "known" && (
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
  )
}
