// タスク一覧の「最新化」の ↻。置き場（`place`）で変わるのは箱の大きさと枠だけ。
// 読んでいるあいだは `--accent` で回り、押せない。

import clsx from "clsx"
import type { ReactElement } from "react"

import { Button } from "../../../components/ui/button/button.tsx"
import { RefreshIcon } from "../../../components/ui/icon/icon.tsx"
import { useRefreshTasks } from "../hooks/use-refresh-task-list.ts"
import styles from "./task-refresh-button.module.css"

const LABEL = "最新化"

export function TaskRefreshButton(props: { readonly place: "sidebar" | "modal" }): ReactElement {
  const { refreshing, refresh } = useRefreshTasks()
  const icon = (
    <span
      className={clsx(styles["task-refresh-icon"], refreshing && styles["task-refresh-spinning"])}
    >
      <RefreshIcon />
    </span>
  )
  if (props.place === "sidebar") {
    return (
      <Button
        variant="ghost"
        size="action"
        pressed="none"
        disabled={refreshing}
        ariaLabel={LABEL}
        disclosure={{ kind: "none" }}
        ariaHasPopup={undefined}
        title={LABEL}
        className={styles["task-refresh-sidebar"]}
        onClick={refresh}
      >
        {icon}
      </Button>
    )
  }
  return (
    <Button
      variant="outline"
      size="action"
      pressed="none"
      disabled={refreshing}
      ariaLabel={LABEL}
      disclosure={{ kind: "none" }}
      ariaHasPopup={undefined}
      title={LABEL}
      className={styles["task-refresh-modal"]}
      onClick={refresh}
    >
      {icon}
    </Button>
  )
}
