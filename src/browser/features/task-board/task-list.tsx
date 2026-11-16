// サイドバーの「タスク一覧」。状態の段（いま・つぎ・待ち・ドラフト・済み）に分け、段の見出しに件数を出す。
// 0件の段は出さず、済みの段は畳んで始まる（見出しを押すと開く）。畳んだ済みの行は DOM にも ↑↓ の順にも入れない。
// 行は押すとプレビューが開き、頼む口を出すのは依存が済んだ `todo` と保留だけ。
// 読めない・まだ届いていないときは undefined。
//
// 区画には全件を並べ、入りきらない分は区画の内側でスクロールする。
// 一覧を見渡すのは見出しの「一覧を見る」から開くモーダルの仕事で、ここは直近の並びを視界の端に置いておくだけ。
//
// 区画の枠と見出しはサイドバーの持ち物で、ここは中身だけを描く。

import clsx from "clsx"
import type { ReactElement, RefObject } from "react"

import {
  hasTaskStatus,
  type TaskSummaryItem,
  type TaskSummaryResult,
} from "../../../shared/repository/task-summary.ts"
import { ChevronRightIcon } from "../../components/ui/icon/icon.tsx"
import { Text } from "../../components/ui/text/text.tsx"
import { TaskItem, type TaskItemPeek } from "./components/task-item.tsx"
import { TaskPeek, type TaskPeekRun } from "./components/task-peek.tsx"
import { TaskSkeleton } from "./components/task-skeleton.tsx"
import { isTaskRequestable } from "./domain/task-run-prompt.ts"
import { TASK_STAGE_LABEL, type TaskStageGroup } from "./domain/task-stage.ts"
import {
  taskPeekDomId,
  taskRowDomId,
  type TaskPeekConfirm,
  type TaskPeekControl,
} from "./hooks/use-task-peek.ts"
import styles from "./task-board.module.css"
import listStyles from "./task-list.module.css"
import type { TaskListModel } from "./use-task-list-model.ts"

type TaskListProps = {
  readonly tasks: TaskSummaryResult
  readonly model: TaskListModel
  readonly rootRef: RefObject<HTMLDivElement | null>
}

export function TaskList(props: TaskListProps): ReactElement {
  const { model, rootRef } = props
  const { peek } = model

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

  const context: PeekContext = {
    peek,
    knownIds: new Set(props.tasks.items.map((task) => task.id)),
  }

  return (
    <div ref={rootRef} id={model.listId} onKeyDown={peek.onKeyDown}>
      {model.searching && model.groups.length === 0 && (
        <Text
          element="p"
          size="inherit"
          tone="ink-quiet"
          weight="inherit"
          className={styles["task-empty"]}
        >
          {`『${model.query.trim()}』に当たるタスクは無い（ID・題・本文を探した）`}
        </Text>
      )}
      {model.groups.map((group) => (
        <TaskStageSection key={group.stage} group={group} context={context} model={model} />
      ))}
    </div>
  )
}

function TaskStageSection(props: {
  readonly group: TaskStageGroup
  readonly context: PeekContext
  readonly model: TaskListModel
}): ReactElement {
  const { group, context, model } = props
  const foldable = group.stage === "done" && !model.searching
  const open = !foldable || model.doneOpen
  const label = TASK_STAGE_LABEL[group.stage]
  const headId = `task-stage-${group.stage}`
  return (
    <section className={listStyles["task-stage"]} aria-labelledby={headId}>
      {foldable ? (
        <button
          type="button"
          id={headId}
          aria-expanded={open}
          className={clsx(listStyles["task-stage-head"], listStyles["task-stage-fold"])}
          onClick={model.onToggleDone}
        >
          <span className={listStyles["task-stage-chevron"]}>
            <ChevronRightIcon />
          </span>
          {label}
          <span className={listStyles["task-stage-count"]}>{group.tasks.length}</span>
        </button>
      ) : (
        <h3 id={headId} className={listStyles["task-stage-head"]}>
          {label}
          <span className={listStyles["task-stage-count"]}>{group.tasks.length}</span>
        </h3>
      )}
      {open && (
        <ul className={styles["task-list"]}>
          {group.tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              rowId={taskRowDomId(task.id)}
              query={model.query}
              active={model.activeId === task.id}
              peek={peekOf(task, context)}
              onToggle={() => {
                context.peek.onToggle(task.id)
              }}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

/** 行ごとのプレビューを組むのに要る、一覧全体で1つの値。 */
type PeekContext = {
  readonly peek: TaskPeekControl
  readonly knownIds: ReadonlySet<string>
}

function peekRunOf(task: TaskSummaryItem, confirm: TaskPeekConfirm): TaskPeekRun {
  if (hasTaskStatus(task, "draft")) {
    return { kind: "draft", confirm }
  }
  return isTaskRequestable(task)
    ? { kind: "available", held: hasTaskStatus(task, "hold"), confirm }
    : { kind: "none" }
}

function peekOf(task: TaskSummaryItem, context: PeekContext): TaskItemPeek {
  const { peek } = context
  if (peek.state.kind !== "open" || peek.state.id !== task.id) {
    return { kind: "closed" }
  }
  const run = peekRunOf(task, peek.state.confirm)
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
        onRequest={peek.onRequest}
        onConfirmClose={peek.onConfirmClose}
      />
    ),
  }
}
