// サイドバーの「タスク一覧」。状態の段（いま・つぎ・待ち・ドラフト・済み）に分け、段の見出しに件数を出す。
// 0件の段は出さず、済みの段は畳んで始まる（見出しを押すと開く）。畳んだ済みの行は DOM にも ↑↓ の順にも入れない。
// 行は押すとサイドシート（`TaskSheet`。置き場は会話の画面）が開き、開いている行に印が付く。
// 読めない・まだ届いていないときは undefined。
//
// 区画には全件を並べ、入りきらない分は区画の内側でスクロールする。
// 一覧を見渡すのは見出しの「一覧を見る」から開くモーダルの仕事で、ここは直近の並びを視界の端に置いておくだけ。
//
// 区画の枠と見出しはサイドバーの持ち物で、ここは中身だけを描く。

import clsx from "clsx"
import type { ReactElement, RefObject } from "react"

import type { TaskSummaryResult } from "../../../shared/repository/task-summary.ts"
import { ChevronRightIcon, ListChecksIcon } from "../../components/ui/icon/icon.tsx"
import { Text } from "../../components/ui/text/text.tsx"
import { TaskItem } from "./components/task-item.tsx"
import { TaskSkeleton } from "./components/task-skeleton.tsx"
import { SORT_OPEN_DOM_ID, TASK_SHEET_DOM_ID, taskRowDomId } from "./domain/task-row-dom-id.ts"
import { TASK_STAGE_LABEL, type TaskStageGroup } from "./domain/task-stage.ts"
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

  return (
    <div ref={rootRef} id={model.listId} onKeyDown={model.onListKeyDown}>
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
        <TaskStageSection key={group.stage} group={group} model={model} />
      ))}
    </div>
  )
}

function TaskStageSection(props: {
  readonly group: TaskStageGroup
  readonly model: TaskListModel
}): ReactElement {
  const { group, model } = props
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
          {group.stage === "draft" && model.sort.kind === "some" && (
            <button
              type="button"
              id={SORT_OPEN_DOM_ID}
              aria-expanded={model.sort.open}
              aria-controls={model.sort.open ? TASK_SHEET_DOM_ID : undefined}
              className={listStyles["task-stage-action"]}
              onClick={model.sort.onToggle}
            >
              <ListChecksIcon />
              仕分ける
            </button>
          )}
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
              open={model.sheet.openId === task.id}
              onToggle={() => {
                model.sheet.onOpenRow(task.id)
              }}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
