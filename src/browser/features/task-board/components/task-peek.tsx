// サイドバーのタスクの行から開くのぞき窓。
// 上から、状態の印と語・ID・閉じる口 → 題 → 関わるタスク（依存があるときだけ）→ 本文の頭 → 「全文を開く」「これを始める」。
//
// モーダルでない `<dialog open>` を `position: fixed` で行の左に置く。
// `show()` は窓の中の口へフォーカスを移すので使わない（フォーカスは押した行に残す）。
// 位置は行のボタン（`anchorId`）の矩形から決めて style の変数へ書き、窓の大きさ・画面の大きさ・スクロールが変わるたびに書き直す。

import { X } from "lucide-react"
import type { ReactElement } from "react"

import type { TaskSummaryItem } from "../../../../shared/repository/task-summary.ts"
import { Button } from "../../../components/ui/button/button.tsx"
import { codeSpanParts } from "../../../domain/code-span.ts"
import type { TaskRunConfirmOutcome } from "../domain/task-run-confirm-outcome.ts"
import { TaskBody } from "./task-body.tsx"
import { TaskMark } from "./task-mark.tsx"
import styles from "./task-peek.module.css"
import { TaskRunConfirm } from "./task-run-confirm.tsx"
import { TaskSummaryText } from "./task-summary-text.tsx"

/** 「これを始める」を出すか。出すのは着手できて送り先が見つかるタスクだけ。 */
export type TaskPeekRun =
  | { readonly kind: "none" }
  | { readonly kind: "available"; readonly runPrompt: string; readonly confirming: boolean }

export type TaskPeekProps = {
  readonly task: TaskSummaryItem
  readonly domId: string
  readonly anchorId: string
  readonly run: TaskPeekRun
  /** 本文中の ID の自動リンクが照らす、いまの一覧に載っている ID。 */
  readonly knownIds: ReadonlySet<string>
  readonly onClose: () => void
  readonly onOpenFull: (id: string) => void
  readonly onStart: () => void
  readonly onConfirmClose: (outcome: TaskRunConfirmOutcome) => void
}

export function TaskPeek(props: TaskPeekProps): ReactElement {
  const { task, run } = props

  return (
    <dialog
      ref={(peek) => {
        if (peek === null) {
          return
        }
        return trackAnchor(peek, props.anchorId)
      }}
      open={true}
      id={props.domId}
      aria-label={`${task.id} の詳細`}
      className={styles["task-peek"]}
    >
      <span className={styles["task-peek-tail"]} aria-hidden="true" />
      <div className={styles["task-peek-head"]}>
        <TaskMark status={task.status} />
        <span className={styles["task-peek-state"]}>{statusWordOf(task.status)}</span>
        <span className={styles["task-peek-id"]}>{task.id}</span>
        <Button
          variant="ghost-hover-accent"
          size="secondary"
          pressed="none"
          disabled={false}
          ariaLabel="閉じる"
          ariaHasPopup={undefined}
          disclosure={{ kind: "none" }}
          title={undefined}
          className={styles["task-peek-close"]}
          onClick={props.onClose}
        >
          <X size={15} strokeWidth={2} aria-hidden="true" />
        </Button>
      </div>
      <h3 className={styles["task-peek-title"]}>
        <TaskSummaryText parts={codeSpanParts(task.summary)} />
      </h3>
      {task.dependencies.length > 0 && (
        <p className={styles["task-peek-related"]}>
          関わる{" "}
          <span className={styles["task-peek-related-id"]}>{task.dependencies.join(", ")}</span>
        </p>
      )}
      <div className={styles["task-peek-body"]}>
        <TaskBody
          text={task.body}
          typesetting="peek"
          knownIds={props.knownIds}
          onJump={props.onOpenFull}
        />
        <div className={styles["task-peek-body-fade"]} aria-hidden="true" />
      </div>
      <div className={styles["task-peek-action"]}>
        <Button
          variant="link"
          size="action"
          pressed="none"
          disabled={false}
          ariaLabel={undefined}
          ariaHasPopup="dialog"
          disclosure={{ kind: "none" }}
          title={undefined}
          className={styles["task-peek-open-full"]}
          onClick={() => {
            props.onOpenFull(task.id)
          }}
        >
          全文を開く ↗
        </Button>
        {run.kind === "available" && (
          <button
            type="button"
            aria-haspopup="dialog"
            className={styles["task-peek-start"]}
            onClick={props.onStart}
          >
            これを始める →
          </button>
        )}
      </div>
      {run.kind === "available" && run.confirming && (
        <TaskRunConfirm
          taskId={task.id}
          held={false}
          runPrompt={run.runPrompt}
          onClose={props.onConfirmClose}
        />
      )}
    </dialog>
  )
}

const STATUS_WORD: ReadonlyMap<string, string> = new Map([
  ["todo", "未着手"],
  ["doing", "進行中"],
  ["done", "完了"],
  ["hold", "保留"],
  ["dropped", "取り下げ"],
])

/** 想定外の値はそのまま、読めないときは「—」。 */
function statusWordOf(status: string | undefined): string {
  if (status === undefined) {
    return "—"
  }
  return STATUS_WORD.get(status) ?? status
}

/** 行の左端から窓の右端まで。行はサイドバーの枠から約 32px 内にあり、窓と枠のあいだを約 20px 空ける。 */
const GAP_FROM_ROW = 52
/** 画面の端から空ける幅。 */
const VIEWPORT_MARGIN = 8
/** 尾を窓の上下の角から離す幅。 */
const TAIL_MARGIN = 20

/** 窓を行の左に置き、行が動く・窓の大きさが変わるたびに置き直す。外す関数を返す。 */
function trackAnchor(peek: HTMLDialogElement, anchorId: string): () => void {
  const view = peek.ownerDocument.defaultView
  const place = (): void => {
    const anchor = peek.ownerDocument.getElementById(anchorId)
    if (anchor !== null && view !== null) {
      placeBesideRow(peek, anchor.getBoundingClientRect(), view)
    }
  }
  place()
  const observer = new ResizeObserver(place)
  observer.observe(peek)
  view?.addEventListener("resize", place)
  peek.ownerDocument.addEventListener("scroll", place, { capture: true, passive: true })
  return () => {
    observer.disconnect()
    view?.removeEventListener("resize", place)
    peek.ownerDocument.removeEventListener("scroll", place, { capture: true })
  }
}

/**
 * 窓の右端を行の左に、縦は窓の中央を行の中央に合わせてから画面の上下の内へ寄せ、尾を行の中央の高さに置く。
 * 左に窓が入りきらない幅では左端に寄せて行に重ね、尾を出さない。
 */
function placeBesideRow(peek: HTMLElement, row: DOMRect, view: Window): void {
  const width = peek.offsetWidth
  const height = peek.offsetHeight
  const besideLeft = row.left - GAP_FROM_ROW - width
  const beside = besideLeft >= VIEWPORT_MARGIN
  const rowMiddle = row.top + row.height / 2
  const lowest = Math.max(VIEWPORT_MARGIN, view.innerHeight - VIEWPORT_MARGIN - height)
  const top = Math.min(Math.max(rowMiddle - height / 2, VIEWPORT_MARGIN), lowest)
  const tail = Math.min(Math.max(rowMiddle - top, TAIL_MARGIN), height - TAIL_MARGIN)
  peek.style.setProperty("--task-peek-left", `${String(beside ? besideLeft : VIEWPORT_MARGIN)}px`)
  peek.style.setProperty("--task-peek-top", `${String(top)}px`)
  peek.style.setProperty("--task-peek-tail-top", `${String(tail)}px`)
  peek.style.setProperty("--task-peek-tail-display", beside ? "block" : "none")
}
