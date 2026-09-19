// タスク一覧の表（サイドバーの区画の見出しから開くモーダル）。サイドバーの区画は幅が
// 300px ほどしかなく要約が2〜3行に折り返すので、**一覧を見渡すのは画面いっぱいの表**に任せる
// （docs/requirements.md 4.2）。列は `/list-tasks` が出す表に揃える。
//
// **`<dialog>` の `showModal()` を使う**。
// Esc で閉じるのと、閉じたときにフォーカスを開く口へ戻すのはブラウザのモーダル挙動に任せ、
// 外側（backdrop）のクリックだけを自前で拾う。**`<dialog>` は top layer に出る**ので、
// サイドバー領域の `overflow` には切り取られない。

import { useEffect, useRef, type MouseEvent, type ReactElement } from "react"

import {
  taskReadiness,
  type TaskReadiness,
  type TaskSummaryItem,
} from "../../../protocol/task-summary.ts"
import styles from "./sidebar.module.css"

export type TaskBoardProps = {
  readonly tasks: readonly TaskSummaryItem[] | undefined
  readonly open: boolean
  readonly onClose: () => void
}

export function TaskBoard(props: TaskBoardProps): ReactElement {
  const dialogRef = useRef<HTMLDialogElement>(null)

  // 開いているかどうかは呼び出し側の state が持ち、`<dialog>` の開閉はそれに追随させる
  // （DOM の側に第2の状態を作らない）。Esc で閉じたときは `close` イベントで state へ戻す。
  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) {
      return
    }
    if (props.open && !dialog.open) {
      dialog.showModal()
    }
    if (!props.open && dialog.open) {
      dialog.close()
    }
  }, [props.open])

  /** backdrop のクリックは `<dialog>` 自身が受け取る（中身は子要素が受け取る）。 */
  function handleClick(event: MouseEvent<HTMLDialogElement>): void {
    if (event.target === dialogRef.current) {
      props.onClose()
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles["task-board"]}
      aria-label="タスク一覧"
      onClose={props.onClose}
      onClick={handleClick}
    >
      <div className={styles["task-board-body"]}>
        <div className={styles["task-board-head"]}>
          <h2 className={styles["task-board-heading"]}>タスク一覧</h2>
          <button type="button" className={styles["task-board-close"]} onClick={props.onClose}>
            閉じる
          </button>
        </div>
        <TaskTable tasks={props.tasks} />
      </div>
    </dialog>
  )
}

function TaskTable(props: {
  readonly tasks: readonly TaskSummaryItem[] | undefined
}): ReactElement {
  const tasks = props.tasks
  if (tasks === undefined) {
    return <p className={styles["sidebar-empty"]}>develop/tasks.json が読めない</p>
  }
  if (tasks.length === 0) {
    return <p className={styles["sidebar-empty"]}>タスクが無い</p>
  }

  return (
    <div className={styles["task-board-scroll"]}>
      <table className={styles["task-board-table"]}>
        <thead>
          <tr>
            <th scope="col">ID</th>
            <th scope="col">status</th>
            <th scope="col">難易度</th>
            <th scope="col">loopable</th>
            <th scope="col">依存</th>
            <th scope="col">着手</th>
            <th scope="col">要約</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} tasks={tasks} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TaskRow(props: {
  readonly task: TaskSummaryItem
  readonly tasks: readonly TaskSummaryItem[]
}): ReactElement {
  const doneClass = props.task.status === "done" ? ` ${styles["task-done"]}` : ""

  return (
    <tr className={`${styles["task-board-row"]}${doneClass}`}>
      <th scope="row" className={styles["task-id"]}>
        {props.task.id}
      </th>
      <td>{props.task.status ?? "—"}</td>
      <td>{props.task.difficulty ?? "—"}</td>
      <td>{loopableMark(props.task.loopable)}</td>
      <td>{props.task.dependencies.length === 0 ? "—" : props.task.dependencies.join(", ")}</td>
      <td>
        <ReadinessCell readiness={taskReadiness(props.task, props.tasks)} />
      </td>
      <td>{props.task.summary}</td>
    </tr>
  )
}

/**
 * `loopable`。**`N` は空欄にし、`Y` だけ文字を出す**（2026-09-16 決定。ユーザーの要望
 * 「Nの場合は表示しないようにお願いできる? そうするとYがついてるものが視認しやすくなるから」）。
 * 全行に文字が並ぶと、自動進行に載る `Y` が埋もれるため。**消すのは `N` だけ**で、値が無いときは
 * 他の列と同じ「—」、想定外の値はそのまま出す（読み手が気づけるようにする）。
 */
function loopableMark(loopable: string | undefined): string {
  if (loopable === undefined) {
    return "—"
  }

  return loopable === "N" ? "" : loopable
}

/** 着手可否。**色だけで伝えない**ので、READY / 止めている依存のIDを文字でも出す。 */
function ReadinessCell(props: { readonly readiness: TaskReadiness | undefined }): ReactElement {
  if (props.readiness === undefined) {
    return <>—</>
  }
  if (props.readiness.kind === "ready") {
    return <span className={styles["task-ready"]}>READY</span>
  }

  return (
    <span
      className={styles["task-blocked"]}
    >{`待ち: ${props.readiness.blockedBy.join(", ")}`}</span>
  )
}
