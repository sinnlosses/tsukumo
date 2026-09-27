// タスク一覧の表。列は `/list-tasks` が出す表に揃える。
//
// 狭い画面では、この表が1タスク＝1枚のカードに組み替わる（docs/requirements.md 4.7）。
// 組み替えるのは CSS（task-board.module.css の @media）だけで、ここは幅を測らず表のまま書く。
//
// 依存と着手は1つの列にまとめてある。 分けていたときは同じIDが2列に並んで表を横へ押し広げ、
// いちばん読みたい要約の列が器の外へ出ていた（実測: 依存7件の行で2列あわせて約100字ぶん）。

import type { ReactElement } from "react"

import { Text } from "../../../components/ui/text/text.tsx"
import type { BoardRow } from "../hooks/use-task-board.ts"
import styles from "../task-board.module.css"
import { TaskRow } from "./task-row.tsx"

export function TaskTable(props: { readonly rows: readonly BoardRow[] | undefined }): ReactElement {
  const rows = props.rows
  if (rows === undefined) {
    return (
      <Text
        element="p"
        size="inherit"
        tone="ink-quiet"
        weight="inherit"
        className={styles["task-empty"]}
      >
        タスクの一覧が読めない
      </Text>
    )
  }
  if (rows.length === 0) {
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
    <div className={styles["task-board-scroll"]}>
      <table className={styles["task-board-table"]}>
        {TASK_TABLE_HEAD}
        <tbody>
          {rows.map((row) => (
            <TaskRow key={row.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * 表の見出し行。6列とも中身が完全に静的なので、モジュール定数として1回だけ作る
 * （描き直すたびに作り直さない）。
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
