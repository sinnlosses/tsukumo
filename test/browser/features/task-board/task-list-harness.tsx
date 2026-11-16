import type { ReactElement } from "react"

import { TaskList as TaskListBase } from "../../../../src/browser/features/task-board/task-list.tsx"
import { TaskSearchField } from "../../../../src/browser/features/task-board/task-search-field.tsx"
import { useTaskListModel } from "../../../../src/browser/features/task-board/use-task-list-model.ts"
import type { TaskSummaryResult } from "../../../../src/shared/repository/task-summary.ts"

/** サイドバーの区画と同じ組み合わせ（探す欄と一覧が1つの状態を共有する）。 */
export function TaskList(props: { readonly tasks: TaskSummaryResult }): ReactElement {
  const { model, rootRef } = useTaskListModel(props.tasks)
  return (
    <>
      <TaskSearchField
        query={model.query}
        searching={model.searching}
        matchCount={model.matchCount}
        listId={model.listId}
        {...(model.activeRowDomId === undefined ? {} : { activeRowDomId: model.activeRowDomId })}
        onQueryChange={model.onQueryChange}
        onKeyDown={model.onSearchKeyDown}
      />
      <TaskListBase tasks={props.tasks} model={model} rootRef={rootRef} />
    </>
  )
}
