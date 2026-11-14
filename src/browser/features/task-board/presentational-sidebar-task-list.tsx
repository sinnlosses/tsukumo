// サイドバーのタスクの一覧。「着手できる」と「待ち」の2群。選んだ行にだけ「依頼」を出す。
// 行を押すと選ぶだけで、送るのは「依頼」か Enter。

import type { ReactElement } from "react"

import { Button } from "../../components/ui/button/button.tsx"
import { TaskRowAttributes } from "./components/task-attribute.tsx"
import type { SidebarTaskListView, SidebarTaskRow } from "./domain/sidebar-task-list-view.ts"
import styles from "./sidebar-task-list.module.css"
import { TaskSummaryText } from "./task-summary-text.tsx"

const NO_BEADS_TEXT = "このリポジトリにはタスクの置き場が無い"
const LOADING_TEXT = "タスクを読んでいる"
const UNKNOWN_TEXT = "タスクの一覧を読めない"

export function PresentationalSidebarTaskList(props: SidebarTaskListView): ReactElement {
  switch (props.kind) {
    case "no-beads":
      return <p className={styles["sidebar-task-message"]}>{NO_BEADS_TEXT}</p>
    case "loading":
      return <p className={styles["sidebar-task-message"]}>{LOADING_TEXT}</p>
    case "unknown":
      return <p className={styles["sidebar-task-message"]}>{UNKNOWN_TEXT}</p>
    case "list":
      return (
        <div className={styles["sidebar-task-list"]}>
          <p className={styles["sidebar-task-group"]}>着手できる {props.ready.length} 件</p>
          <ul
            id={props.listId}
            role="listbox"
            aria-label="着手できるタスク"
            aria-activedescendant={props.activeOptionId}
            tabIndex={0}
            className={styles["sidebar-task-rows"]}
            onKeyDown={props.onKeyDown}
          >
            {props.ready.map((row) => (
              <li
                key={row.id}
                id={row.optionId}
                role="option"
                aria-selected={row.selected}
                className={styles["sidebar-task-row"]}
                onClick={() => {
                  props.onSelect(row.id)
                }}
              >
                <RowBody row={row} />
                <Button
                  variant="solid-accent"
                  size="label"
                  pressed="none"
                  disabled={props.gate.kind === "closed"}
                  title={props.gate.kind === "closed" ? props.gate.reason : undefined}
                  disclosure={{ kind: "none" }}
                  className={styles["sidebar-task-go"]}
                  onClick={() => {
                    props.onRequest(row.id)
                  }}
                >
                  依頼
                </Button>
              </li>
            ))}
          </ul>
          <p className={styles["sidebar-task-group"]}>待ち</p>
          <ul aria-label="待ちのタスク" className={styles["sidebar-task-rows"]}>
            {props.waiting.map((row) => (
              <li key={row.id} className={styles["sidebar-task-row"]}>
                <RowBody row={row} />
              </li>
            ))}
          </ul>
        </div>
      )
  }
}

function RowBody(props: { readonly row: SidebarTaskRow }): ReactElement {
  const row = props.row
  return (
    <>
      <span className={styles["sidebar-task-meta"]}>
        <span className={styles["sidebar-task-id"]}>{row.id}</span>
        <TaskRowAttributes difficulty={row.difficulty} loopable={row.loopable} />
        {row.waitingFor.length > 0 && <span>待ち: {row.waitingFor.join("・")}</span>}
      </span>
      <span className={styles["sidebar-task-title"]}>
        <TaskSummaryText parts={row.summary} />
      </span>
    </>
  )
}
