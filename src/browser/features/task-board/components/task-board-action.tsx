// タスクのモーダルの下の操作の帯。置き場所を開くリンク・「<キャラクター名> に頼む」（ドラフトでは「却下する」「計画する」）。
// 頼む口を押せないときは薄くし、横に理由を添える。

import type { ReactElement } from "react"

import { Button } from "../../../components/ui/button/button.tsx"
import { ExternalLinkIcon, SendIcon } from "../../../components/ui/icon/icon.tsx"
import type { TaskBoardOpener, TaskBoardRun } from "../domain/task-board-view.ts"
import { useAskLabel } from "../hooks/use-ask-label.ts"
import styles from "./task-board-action.module.css"

export function TaskBoardAction(props: {
  readonly opener: TaskBoardOpener
  readonly run: TaskBoardRun
}): ReactElement {
  const { opener, run } = props
  const askLabel = useAskLabel()
  return (
    <div className={styles["task-board-action"]}>
      {opener.kind === "issue" && (
        <a
          href={opener.url}
          target="_blank"
          rel="noreferrer"
          className={styles["task-board-action-link"]}
        >
          <ExternalLinkIcon />
          Issue を開く
        </a>
      )}
      {run.kind === "draft" ? (
        <>
          <Button
            variant="outline"
            size="secondary"
            pressed="none"
            disabled={false}
            disclosure={{ kind: "dialog" }}
            className={styles["task-board-drop"]}
            onClick={run.onDrop}
          >
            却下する
          </Button>
          <Button
            variant="solid-accent"
            size="subheading"
            pressed="none"
            disabled={false}
            disclosure={{ kind: "dialog" }}
            className={styles["task-board-run-plan"]}
            onClick={run.onPlan}
          >
            <SendIcon />
            計画する
          </Button>
        </>
      ) : (
        <Button
          variant="solid-accent"
          size="subheading"
          pressed="none"
          disabled={run.kind === "unavailable"}
          disclosure={{ kind: "dialog" }}
          title={run.kind === "unavailable" ? run.reason : undefined}
          className={styles["task-board-run"]}
          onClick={run.kind === "available" ? run.onRun : ignoreClick}
        >
          <SendIcon />
          {askLabel}
        </Button>
      )}
      {run.kind === "unavailable" && (
        <span className={styles["task-board-run-reason"]}>{run.reason}</span>
      )}
    </div>
  )
}

/** 押せないボタンの `onClick`（`Button` は押せないときに呼ばない）。 */
function ignoreClick(): void {}
