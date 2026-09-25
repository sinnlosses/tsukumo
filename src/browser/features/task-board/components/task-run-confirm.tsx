// 「このタスクを実行しますか」の確認（`components/task-run-button.tsx` が押されたときだけ開く）。
// OK まで行くと `/next-task <ID>` を**入力欄を経由せずに** dispatch する（`<Composer>` の
// 下書きには触らない。docs/design.md 6.2）。送ったあとは、サーバから返る `request` イベントが
// メインビューに依頼として並ぶので、打ったのと同じ見え方になる。
//
// **送ったあとは、包んでいる表（`task-board.tsx`）も閉じる**（`board-close.tsx`）。閉じないと、
// メインビューに並んだ依頼が画面いっぱいの表に隠れて「押したのに何も起きない」に見える。
// 区画の一覧から開いたときは閉じる器が無いので、確認だけが閉じる。
//
// **ターンが動いている間は断る**（押せなくするのではなく、押したら理由を出す）。送信の口
// （`<Composer>` の `submit`）は進行中なら黙って送らないので、ここで黙って消えると
// 「押したのに何も起きない」になる。開いたあとに始まったターンもここに出る。
//
// **どの機能の語彙も持たない確認ではない**（タスクIDと `/next-task` を知っている）ので
// `browser/components/` には上げない。上げたとしてもあちらの箱は `stores/` を引けない。

import { type MouseEvent, type ReactElement } from "react"

import { Text } from "../../../components/ui/text/text.tsx"
import { useModalDialog } from "../../../hooks/use-modal-dialog.ts"
import { useSessionDispatch, useTurnRunning } from "../../../stores/session.tsx"
import { useBoardClose } from "../board-close.tsx"
import styles from "../task-board.module.css"

export type TaskRunConfirmProps = {
  readonly taskId: string
  /** 送ったあと・断ったあと・Esc で閉じたあとのいずれでも呼ばれる（開いているかは呼び出し側が持つ）。 */
  readonly onClose: () => void
}

/**
 * 開いた状態で組み立てられる `<dialog>`。**表のモーダルの上に重ねて開く**——`showModal()` は
 * top layer に積むので下の表より必ず上に出て、Esc はいちばん上（この確認）だけを閉じる。
 * 表を閉じてから出す形にすると、断ったあとに一覧へ戻れない。
 */
export function TaskRunConfirm(props: TaskRunConfirmProps): ReactElement {
  const dispatch = useSessionDispatch()
  const turnInProgress = useTurnRunning()
  const dialogRef = useModalDialog(true)
  const closeBoard = useBoardClose()
  const prompt = `/next-task ${props.taskId}`

  // **送ったときだけ表も閉じる。** 断ったときに閉じると一覧へ戻れない。
  const run = (): void => {
    dispatch({ type: "prompt", text: prompt, images: [] })
    props.onClose()
    closeBoard()
  }

  // backdrop のクリックは `<dialog>` 自身が受け取る（`hooks/use-task-board.ts` と同じ読み替え）。
  const onDialogClick = (event: MouseEvent<HTMLDialogElement>): void => {
    if (event.target === dialogRef.current) {
      props.onClose()
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles["task-run-confirm"]}
      aria-label="タスクの実行"
      onClose={props.onClose}
      onClick={onDialogClick}
    >
      <Text element="p" size="heading" tone="inherit" weight="semibold" className="">
        {props.taskId} を実行しますか
      </Text>
      {turnInProgress ? (
        <p className={styles["task-run-note"]}>
          いまターンが動いているので送れない。終わってからもう一度押す。
        </p>
      ) : (
        <p className={styles["task-run-note"]}>
          入力欄に <code className={styles["task-run-prompt"]}>{prompt}</code> と打つのと同じ。
        </p>
      )}
      <div className={styles["task-run-actions"]}>
        <button type="button" className={styles["task-run-cancel"]} onClick={props.onClose}>
          キャンセル
        </button>
        {!turnInProgress && (
          <button type="button" className={styles["task-run-ok"]} onClick={run}>
            実行する
          </button>
        )}
      </div>
    </dialog>
  )
}
