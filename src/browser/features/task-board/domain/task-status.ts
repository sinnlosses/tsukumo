// status（`todo` / `doing` / `done`）を色に対応させる1つだけの仕事。区画の一覧
// （`task-list.tsx`）と表の行（`components/task-row.tsx`）の両方が読むので、どちらの部品にも
// 属さない場所に置く（機能の語彙の純関数は `domain/`。docs/design.md 2章）。

import styles from "../task-board.module.css"

/** todo / doing / done は色で区別し、それ以外（想定外の値）は注意色にする。文字は status のまま出す。 */
export function taskStatusClass(status: string): string {
  if (status === "todo") {
    return styles["task-status-todo"] ?? ""
  }
  if (status === "doing") {
    return styles["task-status-doing"] ?? ""
  }
  if (status === "done") {
    return styles["task-status-done"] ?? ""
  }
  return styles["task-status-other"] ?? ""
}
