// タスク一覧の「最新化」の口。枠なしで、大きさは置き場の段に合わせる（`box`）。
// 読んでいるあいだは `--accent` で回り、押せない。

import clsx from "clsx"
import type { ReactElement } from "react"

import { Button } from "../../components/ui/button/button.tsx"
import { RefreshIcon } from "../../components/ui/icon/icon.tsx"
import { useRefreshTasks } from "./hooks/use-refresh-task-list.ts"
import styles from "./task-refresh-button.module.css"

const LABEL = "最新化"

type TaskRefreshButtonProps = {
  /** `compact` はサイドバーの見出し（小さいラベルの段）に並べる 24px、`regular` は閉じる口とそろえる 28px。 */
  readonly box: "compact" | "regular"
}

export function TaskRefreshButton(props: TaskRefreshButtonProps): ReactElement {
  const { refreshing, refresh } = useRefreshTasks()
  return (
    <span
      className={
        props.box === "compact" ? styles["task-refresh-compact"] : styles["task-refresh-regular"]
      }
    >
      <Button
        variant="ghost"
        size="action"
        pressed="none"
        disabled={refreshing}
        ariaLabel={LABEL}
        disclosure={{ kind: "none" }}
        title={LABEL}
        className={styles["task-refresh"]}
        onClick={refresh}
      >
        <span
          className={clsx(
            styles["task-refresh-icon"],
            refreshing && styles["task-refresh-spinning"],
          )}
        >
          <RefreshIcon />
        </span>
      </Button>
    </span>
  )
}
