// タスク一覧の表（サイドバーの区画の見出しから開くモーダル）の**見た目だけ**。フックを1つも
// 持たず、受け取った値と呼び先をそのまま描く（docs/design.md 2章「機能の中を分ける」）。
// 開閉の同期と backdrop の判定は `task-board.tsx` と `hooks/use-task-board.ts` にある。
//
// サイドバーの区画は幅が 300px ほどしかなく要約が2〜3行に折り返すので、**一覧を見渡すのは
// 画面いっぱいの表**に任せる（docs/requirements.md 4.2）。列は `/list-tasks` が出す表に揃える。
//
// **狭い画面では、この表が1タスク＝1枚のカードに組み替わる**（docs/requirements.md 4.7）。
// 組み替えるのは CSS（task-board.module.css の @media）だけで、**ここは幅を測らず表のまま書く**。
// 見出しの行が隠れるぶん意味が読み取れなくなるセルにだけ `data-label` を持たせ、CSS が
// `::before` でラベルを出す（ID・status・要約は値そのもので分かるので持たせない）。
//
// **依存と着手は1つの列にまとめてある。** 分けていたときは同じIDが2列に並んで表を横へ押し広げ、
// いちばん読みたい要約の列が器の外へ出ていた（実測: 依存7件の行で2列あわせて約100字ぶん）。
// `todo` は着手できるかだけを出し、それ以外の status は依存をそのまま記録として並べる。
//
// **`<dialog>` は top layer に出る**ので、サイドバー領域の `overflow` には切り取られない。
// Esc で閉じるのと、閉じたときにフォーカスを開く口へ戻すのはブラウザのモーダル挙動に任せる。

import { Fragment, memo, type MouseEvent, type ReactElement, type RefObject } from "react"

import {
  taskReadiness,
  unfinishedTaskIds,
  type TaskReadiness,
  type TaskSummaryItem,
} from "../../../shared/task-summary.ts"
import styles from "./task-board.module.css"
import { taskStatusClass } from "./task-list.tsx"

export type PresentationalTaskBoardProps = {
  readonly tasks: readonly TaskSummaryItem[] | undefined
  /** `<dialog>` に付ける ref。開閉は `hooks/use-task-board.ts` が DOM へ写す。 */
  readonly ref: RefObject<HTMLDialogElement | null>
  readonly onClose: () => void
  readonly onDialogClick: (event: MouseEvent<HTMLDialogElement>) => void
}

/**
 * **props はここだけ分解して受ける**（他の部品は `props.x` のまま）。ref を `props.ref` の形で
 * 描画中に読むと `react(refs)`（refs は描画中に触らない）が落ちるため。
 */
export function PresentationalTaskBoard({
  tasks,
  ref,
  onClose,
  onDialogClick,
}: PresentationalTaskBoardProps): ReactElement {
  return (
    <dialog
      ref={ref}
      className={styles["task-board"]}
      aria-label="タスク一覧"
      onClose={onClose}
      onClick={onDialogClick}
    >
      <div className={styles["task-board-body"]}>
        <div className={styles["task-board-head"]}>
          <h2 className={styles["task-board-heading"]}>タスク一覧</h2>
          <button type="button" className={styles["task-board-close"]} onClick={onClose}>
            閉じる
          </button>
        </div>
        <TaskTable tasks={tasks} />
      </div>
    </dialog>
  )
}

/**
 * 表の見出し行。6列とも中身が完全に静的なので、モジュール定数として1回だけ作る
 * （`<TaskTable>` を描き直すたびに作り直さない）。
 */
const TASK_TABLE_HEAD = (
  <thead>
    <tr>
      <th scope="col">ID</th>
      <th scope="col">status</th>
      <th scope="col">難易度</th>
      <th scope="col">loopable</th>
      <th scope="col">着手</th>
      <th scope="col">要約</th>
    </tr>
  </thead>
)

/**
 * `tasks` の参照が変わらない限り描き直さない（`memo`）。**`<TaskBoard>` は閉じている間も
 * `<dialog>` ごとマウントされたままなので**、サイドバーの他の区画（進行中のツールなど）が
 * 変わるたびにここまで再描画が届く。`tasks` はタスク一覧が実際に変わったときしか参照が
 * 変わらない（`src/shared/session-state.ts` の `tasks-changed`）ので、`memo` だけで
 * 「閉じている間・無関係な変化では組み直さない」が満たせる。
 */
const TaskTable = memo(function TaskTable(props: {
  readonly tasks: readonly TaskSummaryItem[] | undefined
}): ReactElement {
  const tasks = props.tasks
  if (tasks === undefined) {
    return <p className={styles["task-empty"]}>develop/tasks.json が読めない</p>
  }
  if (tasks.length === 0) {
    return <p className={styles["task-empty"]}>タスクが無い</p>
  }

  // 「まだ done でないタスクのID」は一覧全体から1回だけ作り、行ごとの `taskReadiness` へ
  // 使い回す（`src/shared/task-summary.ts` 参照。以前は行ごとに作り直していた）。
  const unfinished = unfinishedTaskIds(tasks)

  return (
    <div className={styles["task-board-scroll"]}>
      <table className={styles["task-board-table"]}>
        {TASK_TABLE_HEAD}
        <tbody>
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} unfinishedTaskIds={unfinished} />
          ))}
        </tbody>
      </table>
    </div>
  )
})

function TaskRow(props: {
  readonly task: TaskSummaryItem
  readonly unfinishedTaskIds: ReadonlySet<string>
}): ReactElement {
  const status = props.task.status
  const doneClass = status === "done" ? ` ${styles["task-done"]}` : ""

  return (
    <tr className={`${styles["task-board-row"]}${doneClass}`}>
      <th scope="row" className={styles["task-id"]}>
        {props.task.id}
      </th>
      <td className={status === undefined ? "" : taskStatusClass(status)}>{status ?? "—"}</td>
      <td>{props.task.difficulty ?? "—"}</td>
      <td data-label="loopable">{loopableMark(props.task.loopable)}</td>
      <td data-label="着手">
        <ReadinessCell
          readiness={taskReadiness(props.task, props.unfinishedTaskIds)}
          dependencies={props.task.dependencies}
        />
      </td>
      <td>{props.task.summary}</td>
    </tr>
  )
}

/**
 * `loopable`。**`N` は空欄にし、`Y` だけ文字を出す。**
 * 全行に文字が並ぶと、自動進行に載る `Y` が埋もれるため。**消すのは `N` だけ**で、値が無いときは
 * 他の列と同じ「—」、想定外の値はそのまま出す（読み手が気づけるようにする）。
 */
function loopableMark(loopable: string | undefined): string {
  if (loopable === undefined) {
    return "—"
  }

  return loopable === "N" ? "" : loopable
}

/**
 * 着手と依存の列。**`todo` は着手できるかを出し**（READY / 止めている依存のID。済んだ依存は
 * 着手の判断に要らないので出さない）、**判定しない status は依存をそのまま並べる**。
 * **色だけで伝えない**ので READY / 待ち の文字も出す。
 */
function ReadinessCell(props: {
  readonly readiness: TaskReadiness | undefined
  readonly dependencies: readonly string[]
}): ReactElement {
  if (props.readiness === undefined) {
    return props.dependencies.length === 0 ? <>—</> : <TaskIdList ids={props.dependencies} />
  }
  if (props.readiness.kind === "ready") {
    return <span className={styles["task-ready"]}>READY</span>
  }

  return (
    <span className={styles["task-blocked"]}>
      {"待ち: "}
      <TaskIdList ids={props.readiness.blockedBy} />
    </span>
  )
}

/**
 * IDの並び。**区切りの `, ` だけを折り返せる場所にする**ため、IDを1つずつ包んで出す
 * （`T-328` の `-` で改行されると読めなくなる。折らない指定は task-board.module.css の
 * `.task-dep-id`）。
 */
function TaskIdList(props: { readonly ids: readonly string[] }): ReactElement {
  return (
    <>
      {props.ids.map((id, index) => (
        <Fragment key={id}>
          {index === 0 ? "" : ", "}
          <span className={styles["task-dep-id"]}>{id}</span>
        </Fragment>
      ))}
    </>
  )
}
