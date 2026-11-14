// サイドバーの中段に置くタスクの一覧の入口。`excludedIds` は、ほかの場所が同じタスクを出しているときに外すタスクの ID。

import type { ReactElement } from "react"

import { useSidebarTaskList } from "./hooks/use-sidebar-task-list.ts"
import { PresentationalSidebarTaskList } from "./presentational-sidebar-task-list.tsx"

export function SidebarTaskList(props: { readonly excludedIds: readonly string[] }): ReactElement {
  return <PresentationalSidebarTaskList {...useSidebarTaskList(props.excludedIds)} />
}
