// サイドバーのまん中の区画（タスク一覧）ひとまとまり。
// 区画の枠（`SidebarSection`）はサイドバーが持ち、中身の一覧はタスク一覧の機能から借りる。
// 見出しの「一覧を見る」はタスクのモーダルを開くよう頼むだけで、モーダルそのものは会話の画面が置く（`useTaskBoardRequest`）。
//
// タスクの購読はここが持つ。
// `<Layout>` へ上げると木の頂点がタスクを購読することになり、タスクが変わるたびに全領域が描き直される。

import type { ReactElement } from "react"

import { TaskList } from "../../../../features/task-board/task-list.tsx"
import { TaskRefreshButton } from "../../../../features/task-board/task-refresh-button.tsx"
import { TaskSearchField } from "../../../../features/task-board/task-search-field.tsx"
import { useTaskListModel } from "../../../../features/task-board/use-task-list-model.ts"
import { useSession } from "../../../../stores/session.ts"
import { useTaskBoardRequest } from "../../../../stores/task-board-request.ts"
import { SidebarSection } from "./section.tsx"
import styles from "./task-section.module.css"

export function TaskSection(): ReactElement {
  const tasks = useSession((session) => session.state.tasks)
  const openList = useTaskBoardRequest((state) => state.openList)
  const { model, rootRef } = useTaskListModel(tasks)

  return (
    <SidebarSection
      title="タスク"
      extraClass={styles["sidebar-block-tasks"]}
      action={{ label: "一覧を見る", onAction: openList }}
      headerExtra={<TaskRefreshButton />}
      count={tasks.kind === "known" ? tasks.items.length : undefined}
      searchField={
        <TaskSearchField
          query={model.query}
          searching={model.searching}
          matchCount={model.matchCount}
          listId={model.listId}
          {...(model.activeRowDomId === undefined ? {} : { activeRowDomId: model.activeRowDomId })}
          onQueryChange={model.onQueryChange}
          onKeyDown={model.onSearchKeyDown}
        />
      }
    >
      <TaskList tasks={tasks} model={model} rootRef={rootRef} />
    </SidebarSection>
  )
}
