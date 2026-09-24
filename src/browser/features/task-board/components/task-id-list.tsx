// IDの並び。**区切りの `, ` だけを折り返せる場所にする**ため、IDを1つずつ包んで出す
// （`T-xxx` の `-` で改行されると読めなくなる。折らない指定は task-board.module.css の
// `.task-dep-id`）。

import { Fragment, type ReactElement } from "react"

import styles from "../task-board.module.css"

export function TaskIdList(props: { readonly ids: readonly string[] }): ReactElement {
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
