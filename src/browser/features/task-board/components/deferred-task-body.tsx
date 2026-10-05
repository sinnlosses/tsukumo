// タスクの本文の Markdown の描画一式（react-markdown・remark 一式）を、初期読み込みの束から `import()` で外して読む口。
// 使い手はここの部品を使い、描画一式のモジュールを直接 import しない（直接 import すると一式が入口の束に戻る）。
//
// 読み終わるまでは高さを持たない空の器に `aria-busy="true"` を出す。
// 読めなかったときは本文を字のまま出し、`aria-busy` を出さない。

import clsx from "clsx"
import type { ReactElement } from "react"

import { deferredModule } from "../../../hooks/deferred-module.ts"
import styles from "./task-body.module.css"
import type { TaskBodyProps } from "./task-body.tsx"

const taskBodyRenderer = deferredModule(() => import("./task-body.tsx"))

/** 描画一式を読み込む。何度呼んでも読み込みは1回で、済めば待っている部品が描き直る。 */
export const loadTaskBody = taskBodyRenderer.load

/** タスクの本文。 */
export function TaskBody(props: TaskBodyProps): ReactElement {
  const state = taskBodyRenderer.useLoadState()
  switch (state.kind) {
    case "loading":
      return <div aria-busy="true" />
    case "failed":
      return <p className={clsx(styles["task-body"], styles["task-body-plain"])}>{props.text}</p>
    case "ready":
      return <state.module.TaskBody {...props} />
  }
}
