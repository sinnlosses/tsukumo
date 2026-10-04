// タスクのモーダルの下の操作の帯。ID をコピー・置き場所を開く口・「tsukumo に頼む」。
// 「tsukumo に頼む」を押せないときは薄くし、横に理由を添える。
// 置き場所の一覧を取り直している間は、「エディタで開く」を押せるかがまだ決まらないので `aria-busy` を出す。

import { Copy, ExternalLink, FileText, MessageCircle } from "lucide-react"
import type { ReactElement } from "react"

import { Button } from "../../../components/ui/button/button.tsx"
import type { TaskBoardOpener, TaskBoardRun } from "../domain/task-board-view.ts"
import styles from "./task-board-action.module.css"

export function TaskBoardAction(props: {
  readonly onCopy: () => void
  readonly opener: TaskBoardOpener
  readonly run: TaskBoardRun
}): ReactElement {
  const { opener, run } = props
  return (
    <div
      className={styles["task-board-action"]}
      aria-busy={opener.kind === "file" && opener.availability === "checking"}
    >
      <Button
        variant="outline"
        size="secondary"
        pressed="none"
        disabled={false}
        ariaLabel={undefined}
        disclosure={{ kind: "none" }}
        ariaHasPopup={undefined}
        title={undefined}
        className={styles["task-board-action-button"]}
        onClick={props.onCopy}
      >
        <Copy size={14} strokeWidth={2} aria-hidden="true" />
        ID をコピー
      </Button>
      {opener.kind === "file" && (
        <Button
          variant="outline"
          size="secondary"
          pressed="none"
          disabled={opener.availability !== "tracked"}
          ariaLabel={undefined}
          disclosure={{ kind: "none" }}
          ariaHasPopup={undefined}
          title={
            opener.availability === "untracked"
              ? "この作業ツリーでは git 管理下に無いので開けない"
              : undefined
          }
          className={styles["task-board-action-button"]}
          onClick={opener.onOpen}
        >
          <FileText size={14} strokeWidth={2} aria-hidden="true" />
          エディタで開く
        </Button>
      )}
      {opener.kind === "issue" && (
        <a
          href={opener.url}
          target="_blank"
          rel="noreferrer"
          className={styles["task-board-action-link"]}
        >
          <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
          Issue を開く
        </a>
      )}
      <Button
        variant="solid-accent"
        size="subheading"
        pressed="none"
        disabled={run.kind === "unavailable"}
        ariaLabel={undefined}
        ariaHasPopup="dialog"
        disclosure={{ kind: "none" }}
        title={run.kind === "unavailable" ? run.reason : undefined}
        className={styles["task-board-run"]}
        onClick={run.kind === "available" ? run.onRun : ignoreClick}
      >
        <MessageCircle size={16} strokeWidth={2} aria-hidden="true" />
        tsukumo に頼む
      </Button>
      {run.kind === "unavailable" && (
        <span className={styles["task-board-run-reason"]}>{run.reason}</span>
      )}
    </div>
  )
}

/** 押せないボタンの `onClick`（`Button` は押せないときに呼ばない）。 */
function ignoreClick(): void {}
