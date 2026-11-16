import type { ReactElement } from "react"

import { TaskList as TaskListBase } from "../../../../src/browser/features/task-board/task-list.tsx"
import { TaskSearchField } from "../../../../src/browser/features/task-board/task-search-field.tsx"
import { TaskSheet } from "../../../../src/browser/features/task-board/task-sheet.tsx"
import { useTaskListModel } from "../../../../src/browser/features/task-board/use-task-list-model.ts"
import { useTaskSheet } from "../../../../src/browser/stores/task-sheet.ts"
import type { TaskSummaryResult } from "../../../../src/shared/repository/task-summary.ts"

/**
 * サイドバーの区画と同じ組み合わせ（探す欄と一覧が1つの状態を共有する）に、会話の画面に置くサイドシートを並べる。
 * サイドバーとサイドシートは別の木だが、同じ `useTaskSheet` を読む。
 */
export function TaskList(props: { readonly tasks: TaskSummaryResult }): ReactElement {
  const { model, rootRef } = useTaskListModel(props.tasks)
  const subject = useTaskSheet((state) => state.sheet)
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
      <TaskSheet tasks={props.tasks} sheet={subject} listModeAvailable />
    </>
  )
}

/** 開いているサイドシート（無ければ `null`）。 */
export function sheet(): Element | null {
  return document.querySelector("aside[aria-labelledby]")
}

/** 開いているサイドシートの `aria-labelledby` が指す題（閉じていれば無い）。 */
export function sheetTitle(): string | undefined {
  const id = sheet()?.getAttribute("aria-labelledby")
  return id === undefined || id === null
    ? undefined
    : (document.getElementById(id)?.textContent ?? undefined)
}
