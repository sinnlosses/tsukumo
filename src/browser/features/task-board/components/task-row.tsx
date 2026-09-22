// 表の1行。**値はすべて畳んだ形で受け取る**（`board-row.ts`）ので、ここが決めるのは
// どのセルにどの class を付けるかだけ。
//
// 狭い画面では表がカードに組み替わり見出しの行が消えるので、**値だけでは意味が読み取れない
// セルにだけ `data-label` を持たせる**（CSS が `::before` でラベルを出す。ID・status・要約は
// 値そのもので分かるので持たせない）。

import { type ReactElement } from "react"

import { type BoardRow } from "../board-row.ts"
import styles from "../task-board.module.css"
import { taskStatusClass } from "../task-status.ts"
import { ReadinessCell } from "./readiness-cell.tsx"

export function TaskRow(props: { readonly row: BoardRow }): ReactElement {
  const row = props.row
  const doneClass = row.done ? ` ${styles["task-done"]}` : ""

  return (
    <tr className={`${styles["task-board-row"]}${doneClass}`}>
      <th scope="row" className={styles["task-id"]}>
        {row.id}
      </th>
      <td className={row.status === undefined ? "" : taskStatusClass(row.status)}>
        {row.statusText}
      </td>
      <td>{row.difficultyText}</td>
      <td data-label="loopable">{row.loopableText}</td>
      <td data-label="着手">
        <ReadinessCell readiness={row.readiness} dependencies={row.dependencies} />
      </td>
      <td>{row.summary}</td>
    </tr>
  )
}
