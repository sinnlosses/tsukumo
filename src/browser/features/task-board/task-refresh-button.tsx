// タスク一覧の「最新化」の口。サイドバーとタスクのモーダルで同じ大きさ（28px）・枠なし。
// 読んでいるあいだは `--accent` で回り、押せない。

import clsx from "clsx"
import type { ReactElement } from "react"

import { Button } from "../../components/ui/button/button.tsx"
import { RefreshIcon } from "../../components/ui/icon/icon.tsx"
import { useRefreshTasks } from "./hooks/use-refresh-task-list.ts"
import styles from "./task-refresh-button.module.css"

const LABEL = "最新化"

export function TaskRefreshButton(): ReactElement {
  const { refreshing, refresh } = useRefreshTasks()
  return (
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
        className={clsx(styles["task-refresh-icon"], refreshing && styles["task-refresh-spinning"])}
      >
        <RefreshIcon />
      </span>
    </Button>
  )
}
