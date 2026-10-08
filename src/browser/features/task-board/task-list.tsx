// サイドバーの「タスク一覧」。進行中（doing）だけ先頭のカードにまとめ、残りは一覧の順で出す（todo と done は混ざったまま）。
// `done` は薄く打ち消し線で出す。行とカードは押すとのぞき窓が開き、「これを始める」を出すのは依存が済んだ `todo` だけ。
// 絞り込みで隠れた依存も止めるので、着手できるかは絞る前の全件で判定する。
// 読めない・まだ届いていないときは undefined。
//
// 区画には全件を並べ、入りきらない分は区画の内側でスクロールする。
// 一覧を見渡すのは見出しの「一覧を見る」から開くモーダルの仕事で、ここは直近の並びを視界の端に置いておくだけ。
//
// 件数のチップで絞れる。並びは変えず、出す・出さないだけを決めてから `orderTasksForSidebar` に渡す。
// 絞った結果が0件のときは「タスクが無い」ではなく、選んだ状態の名前を添えた一言にする（全件が0件のときと区別する）。
//
// 区画の枠と見出しはサイドバーの持ち物で、ここは中身だけを描く。

import type { ReactElement } from "react"

import {
  taskReadiness,
  type TaskSummaryItem,
  type TaskSummaryResult,
} from "../../../shared/repository/task-summary.ts"
import { Text } from "../../components/ui/text/text.tsx"
import { TaskItem, type TaskItemPeek } from "./components/task-item.tsx"
import { TaskPeek, type TaskPeekRun } from "./components/task-peek.tsx"
import { TaskRunningCard } from "./components/task-running-card.tsx"
import { TaskSkeleton } from "./components/task-skeleton.tsx"
import { taskListFilterLabel, type TaskListFilterStatus } from "./domain/task-list-count.ts"
import { filterTasksForSidebar } from "./domain/task-sidebar-filter.ts"
import { orderTasksForSidebar, type TaskSidebarOrder } from "./domain/task-sidebar-order.ts"
import {
  taskPeekDomId,
  taskRowDomId,
  useTaskPeek,
  type TaskPeekControl,
} from "./hooks/use-task-peek.ts"
import styles from "./task-board.module.css"

export type TaskListProps = {
  readonly tasks: TaskSummaryResult
  readonly selectedStatus: TaskListFilterStatus
}

export function TaskList(props: TaskListProps): ReactElement {
  const { running, rest } =
    props.tasks.kind === "known"
      ? orderTasksForSidebar(filterTasksForSidebar(props.tasks.items, props.selectedStatus))
      : EMPTY_ORDER
  const { rootRef, control: peek } = useTaskPeek([...running, ...rest].map((task) => task.id))

  if (props.tasks.kind === "loading") {
    return <TaskSkeleton />
  }
  if (props.tasks.kind !== "known") {
    return (
      <Text
        element="p"
        size="inherit"
        tone="ink-quiet"
        weight="inherit"
        className={styles["task-empty"]}
      >
        不明
      </Text>
    )
  }
  if (props.tasks.items.length === 0) {
    return (
      <Text
        element="p"
        size="inherit"
        tone="ink-quiet"
        weight="inherit"
        className={styles["task-empty"]}
      >
        タスクが無い
      </Text>
    )
  }
  if (running.length === 0 && rest.length === 0 && props.selectedStatus !== "all") {
    return (
      <Text
        element="p"
        size="inherit"
        tone="ink-quiet"
        weight="inherit"
        className={styles["task-empty"]}
      >
        {taskListFilterLabel(props.selectedStatus)}のタスクが無い
      </Text>
    )
  }

  const context: PeekContext = {
    peek,
    knownIds: new Set(props.tasks.items.map((task) => task.id)),
  }

  return (
    <div ref={rootRef} onKeyDown={peek.onKeyDown}>
      {running.length > 0 && (
        <ul className={styles["task-running-list"]}>
          {running.map((task) => (
            <TaskRunningCard
              key={task.id}
              task={task}
              rowId={taskRowDomId(task.id)}
              peek={peekOf(task, context)}
              onToggle={() => {
                peek.onToggle(task.id)
              }}
            />
          ))}
        </ul>
      )}
      <ul className={styles["task-list"]}>
        {rest.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            rowId={taskRowDomId(task.id)}
            peek={peekOf(task, context)}
            onToggle={() => {
              peek.onToggle(task.id)
            }}
          />
        ))}
      </ul>
    </div>
  )
}

const EMPTY_ORDER: TaskSidebarOrder = { running: [], rest: [] }

/** 行ごとの窓を組むのに要る、一覧全体で1つの値。 */
type PeekContext = {
  readonly peek: TaskPeekControl
  readonly knownIds: ReadonlySet<string>
}

function peekOf(task: TaskSummaryItem, context: PeekContext): TaskItemPeek {
  const { peek } = context
  if (peek.state.kind !== "open" || peek.state.id !== task.id) {
    return { kind: "closed" }
  }
  const run: TaskPeekRun =
    taskReadiness(task)?.kind === "ready"
      ? { kind: "available", confirming: peek.state.confirming }
      : { kind: "none" }
  const domId = taskPeekDomId(task.id)
  return {
    kind: "open",
    controls: domId,
    element: (
      <TaskPeek
        task={task}
        domId={domId}
        anchorId={taskRowDomId(task.id)}
        run={run}
        knownIds={context.knownIds}
        onClose={peek.onClose}
        onOpenFull={peek.onOpenFull}
        onStart={peek.onStart}
        onConfirmClose={peek.onConfirmClose}
      />
    ),
  }
}
