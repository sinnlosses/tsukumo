// サイドバーのタスクの行から開くプレビュー。
// 上から、状態の印と語・ID・閉じる口 → 題 → 関わるタスク（依存があるときだけ）→ 本文の頭 → 「全文を開く」「<キャラクター名> に頼む」。
//
// モーダルでない `<dialog open popover="manual">` を最上位の層に出し、`position: fixed` で行の左に置く。
// サイドバーの領域の `backdrop-filter` が `position: fixed` の基準になるので、最上位の層へ出してビューポートを基準に戻す。
// `show()` はプレビューの中の口へフォーカスを移すので使わない（フォーカスは押した行に残す）。
// 位置は行のボタン（`anchorId`）の矩形から決めて style の変数へ書き、プレビューの大きさ・画面の大きさ・スクロールが変わるたびに書き直す。

import type { ReactElement } from "react"
import { clamp } from "remeda"

import type { TaskSummaryItem } from "../../../../shared/repository/task-summary.ts"
import { Button } from "../../../components/ui/button/button.tsx"
import { CloseIcon, SendIcon } from "../../../components/ui/icon/icon.tsx"
import { codeSpanParts } from "../../../domain/code-span.ts"
import { TaskBody } from "../deferred-task-body.tsx"
import { taskStateOf } from "../domain/task-board-content.ts"
import type { TaskRunConfirmOutcome } from "../domain/task-run-confirm-outcome.ts"
import type { SingleTaskRequest } from "../domain/task-run-prompt.ts"
import { useAskLabel } from "../hooks/use-ask-label.ts"
import type { TaskPeekConfirm } from "../hooks/use-task-peek.ts"
import { TaskSummaryText } from "../task-summary-text.tsx"
import styles from "./task-peek.module.css"
import { TaskRunConfirm } from "./task-run-confirm.tsx"
import { TaskState } from "./task-state.tsx"

/** プレビューの下端の頼みの口。`available` は「<キャラクター名> に頼む」（頼めるタスクだけ）、`draft` は「却下する」「計画する」。 */
export type TaskPeekRun =
  | { readonly kind: "none" }
  | { readonly kind: "available"; readonly held: boolean; readonly confirm: TaskPeekConfirm }
  | { readonly kind: "draft"; readonly confirm: TaskPeekConfirm }

type TaskPeekProps = {
  readonly task: TaskSummaryItem
  readonly domId: string
  readonly anchorId: string
  readonly run: TaskPeekRun
  /** 本文中の ID の自動リンクが照らす、いまの一覧に載っている ID。 */
  readonly knownIds: ReadonlySet<string>
  readonly onClose: () => void
  readonly onOpenFull: (id: string) => void
  readonly onRequest: (request: SingleTaskRequest) => void
  readonly onConfirmClose: (outcome: TaskRunConfirmOutcome) => void
}

export function TaskPeek(props: TaskPeekProps): ReactElement {
  const { task, run } = props
  const askLabel = useAskLabel()

  return (
    <dialog
      ref={(peek) => {
        if (peek === null) {
          return
        }
        return trackAnchor(peek, props.anchorId)
      }}
      open={true}
      popover="manual"
      id={props.domId}
      aria-label={`${task.id} の詳細`}
      className={styles["task-peek"]}
    >
      <span className={styles["task-peek-tail"]} aria-hidden="true" />
      <div className={styles["task-peek-head"]}>
        <TaskState state={taskStateOf(task)} display="labeled" />
        <span className={styles["task-peek-id"]}>{task.id}</span>
        <Button
          variant="ghost-hover-accent"
          size="secondary"
          pressed="none"
          disabled={false}
          ariaLabel="閉じる"
          disclosure={{ kind: "none" }}
          className={styles["task-peek-close"]}
          onClick={props.onClose}
        >
          <CloseIcon />
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
          disclosure={{ kind: "dialog" }}
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
            onClick={() => {
              props.onRequest({ kind: "start", held: run.held })
            }}
          >
            <SendIcon />
            {askLabel}
          </button>
        )}
        {run.kind === "draft" && (
          <>
            <Button
              variant="link"
              size="action"
              pressed="none"
              disabled={false}
              disclosure={{ kind: "dialog" }}
              className={styles["task-peek-drop"]}
              onClick={() => {
                props.onRequest({ kind: "drop" })
              }}
            >
              却下する
            </Button>
            <button
              type="button"
              aria-haspopup="dialog"
              className={styles["task-peek-start"]}
              onClick={() => {
                props.onRequest({ kind: "plan" })
              }}
            >
              計画する
            </button>
          </>
        )}
      </div>
      {run.kind !== "none" && run.confirm.kind === "request" && (
        <TaskRunConfirm
          target={{ kind: "task", taskId: task.id, request: run.confirm.request }}
          onClose={props.onConfirmClose}
        />
      )}
    </dialog>
  )
}

/** 行の左端からプレビューの右端まで。行はサイドバーの枠から約 22px 内にあり、プレビューと枠のあいだを約 20px 空ける。 */
const GAP_FROM_ROW = 42
/** 画面の端から空ける幅。 */
const VIEWPORT_MARGIN = 8
/** 尾をプレビューの上下の角から離す幅。 */
const TAIL_MARGIN = 20

/** プレビューを行の左に置き、行が動く・プレビューの大きさが変わるたびに置き直す。外す関数を返す。 */
function trackAnchor(peek: HTMLDialogElement, anchorId: string): () => void {
  const view = peek.ownerDocument.defaultView
  const place = (): void => {
    const anchor = peek.ownerDocument.getElementById(anchorId)
    if (anchor !== null && view !== null) {
      placeBesideRow(peek, anchor.getBoundingClientRect(), view)
    }
  }
  peek.showPopover()
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
 * プレビューの右端を行の左に、縦はプレビューの中央を行の中央に合わせてから画面の上下の内へ寄せ、尾を行の中央の高さに置く。
 * 左にプレビューが入りきらない幅では左端に寄せて行に重ね、尾を出さない。
 */
function placeBesideRow(peek: HTMLElement, row: DOMRect, view: Window): void {
  const width = peek.offsetWidth
  const height = peek.offsetHeight
  const besideLeft = row.left - GAP_FROM_ROW - width
  const beside = besideLeft >= VIEWPORT_MARGIN
  const rowMiddle = row.top + row.height / 2
  const lowest = Math.max(VIEWPORT_MARGIN, view.innerHeight - VIEWPORT_MARGIN - height)
  const top = clamp(rowMiddle - height / 2, { min: VIEWPORT_MARGIN, max: lowest })
  const tail = Math.min(Math.max(rowMiddle - top, TAIL_MARGIN), height - TAIL_MARGIN)
  peek.style.setProperty("--task-peek-left", `${String(beside ? besideLeft : VIEWPORT_MARGIN)}px`)
  peek.style.setProperty("--task-peek-top", `${String(top)}px`)
  peek.style.setProperty("--task-peek-tail-top", `${String(tail)}px`)
  peek.style.setProperty("--task-peek-tail-display", beside ? "block" : "none")
}
