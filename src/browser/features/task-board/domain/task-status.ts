// status（`todo` / `doing` / `done`）を色に対応させる。

import styles from "../task-board.module.css"

/** todo / doing / done は色で区別し、それ以外（想定外の値）は注意色にする。文字は status のまま出す。 */
export function taskStatusClass(status: string): string {
  if (status === "todo") {
    return styles["task-status-todo"]
  }
  if (status === "doing") {
    return styles["task-status-doing"]
  }
  if (status === "done") {
    return styles["task-status-done"]
  }
  return styles["task-status-other"]
}
